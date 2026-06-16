export interface RovyInputSignal {
	Connect(handler: (input: InputObject, gameProcessedEvent: boolean) => void): RBXScriptConnection;
}

export interface RovyMouseMovedSignal {
	Connect(handler: (mousePosition: Vector2) => void): RBXScriptConnection;
}

export interface RovyInputSignals {
	InputBegan: RovyInputSignal;
	InputChanged: RovyInputSignal;
	InputEnded: RovyInputSignal;
	MouseMoved?: RovyMouseMovedSignal;
	GetMouseLocation(): Vector2;
}

export interface RovyInputService {
	InputBegan: RovyInputSignal;
	InputChanged: RovyInputSignal;
	InputEnded: RovyInputSignal;
	GetMouseLocation(): Vector2;
	IsKeyDown?(key: Enum.KeyCode): boolean;
	IsMouseButtonPressed?(button: Enum.UserInputType): boolean;
	MouseBehavior?: Enum.MouseBehavior;
	MouseIcon?: string;
}

type PressedInput = Enum.KeyCode | Enum.UserInputType;

function trackInput(set: Set<PressedInput>, input: InputObject, pressed: boolean): void {
	if (input.KeyCode !== Enum.KeyCode.Unknown) {
		if (pressed) set.add(input.KeyCode);
		else set.delete(input.KeyCode);
	}
	if (input.UserInputType !== Enum.UserInputType.Keyboard) {
		if (pressed) set.add(input.UserInputType);
		else set.delete(input.UserInputType);
	}
}

function mouseMoveInput(mousePosition: Vector2): InputObject {
	return {
		UserInputType: Enum.UserInputType.MouseMovement,
		KeyCode: Enum.KeyCode.Unknown,
		Position: new Vector3(mousePosition.X, mousePosition.Y, 0),
	} as InputObject;
}

function readInitialMouseLocation(inputSignals: RovyInputSignals): Vector2 {
	const [ok, location] = pcall(() => inputSignals.GetMouseLocation());
	return ok ? (location as Vector2) : new Vector2(0, 0);
}

function inputPosition(input: InputObject): Vector2 | undefined {
	const position = (input as unknown as { Position?: { X: number; Y: number } }).Position;
	if (position === undefined) return undefined;
	return new Vector2(position.X, position.Y);
}

function combineInputChanged(
	inputSignals: RovyInputSignals,
	setMouseLocation: (mousePosition: Vector2) => void,
	updateMouseLocationFromInput: (input: InputObject) => void,
): RovyInputSignal {
	return {
		Connect(handler) {
			const inputChangedConnection = inputSignals.InputChanged.Connect((input, gameProcessedEvent) => {
				updateMouseLocationFromInput(input);
				handler(input, gameProcessedEvent);
			});
			const mouseMovedConnection = inputSignals.MouseMoved?.Connect((mousePosition) => {
				setMouseLocation(mousePosition);
				handler(mouseMoveInput(mousePosition), false);
			});

			return {
				Connected: true,
				Disconnect() {
					inputChangedConnection.Disconnect();
					mouseMovedConnection?.Disconnect();
					(this as RBXScriptConnection).Connected = false;
				},
			} as RBXScriptConnection;
		},
	};
}

export function getDefaultRovyInputService(): RovyInputService | undefined {
	const [ok, service] = pcall(() => game.GetService("UserInputService"));
	return ok ? (service as UserInputService) : undefined;
}

export function createRovyInputServiceFromSignals(inputSignals: RovyInputSignals): RovyInputService {
	const pressedInputs = new Set<PressedInput>();
	let mouseLocation = readInitialMouseLocation(inputSignals);
	const setMouseLocation = (nextMouseLocation: Vector2): void => {
		mouseLocation = nextMouseLocation;
	};
	const updateMouseLocationFromInput = (input: InputObject): void => {
		const position = inputPosition(input);
		if (position !== undefined) mouseLocation = position;
	};

	return {
		InputBegan: {
			Connect(handler) {
				return inputSignals.InputBegan.Connect((input, gameProcessedEvent) => {
					updateMouseLocationFromInput(input);
					trackInput(pressedInputs, input, true);
					handler(input, gameProcessedEvent);
				});
			},
		},
		InputChanged: combineInputChanged(inputSignals, setMouseLocation, updateMouseLocationFromInput),
		InputEnded: {
			Connect(handler) {
				return inputSignals.InputEnded.Connect((input, gameProcessedEvent) => {
					updateMouseLocationFromInput(input);
					trackInput(pressedInputs, input, false);
					handler(input, gameProcessedEvent);
				});
			},
		},
		GetMouseLocation() {
			return mouseLocation;
		},
		IsKeyDown(key) {
			return pressedInputs.has(key);
		},
		IsMouseButtonPressed(button) {
			return pressedInputs.has(button);
		},
	};
}
