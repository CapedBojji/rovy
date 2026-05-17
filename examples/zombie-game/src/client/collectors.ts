import { Collector, collect } from "@rovy/core";

const TOOL_NAME = "Block Blaster";

export type LocalClientIngress =
	| { kind: "player"; userId: number }
	| { kind: "character"; character?: Model }
	| { kind: "fire"; origin: Vector3; direction: Vector3 }
	| { kind: "restart" };

@collect
export class LocalClientCollect extends Collector<LocalClientIngress> {
	constructor() {
		super();
		const [ok, services] = pcall(() => ({
			Players: game.GetService("Players"),
			UserInputService: game.GetService("UserInputService"),
			Workspace: game.GetService("Workspace"),
		}));
		if (!ok) return;

		const localPlayer = services.Players.LocalPlayer;
		if (localPlayer === undefined) return;
		const mouse = localPlayer.GetMouse();
		this.enqueue({ kind: "player", userId: localPlayer.UserId });

		let currentTool: Tool | undefined;
		const onToolActivated = (character: Model) => {
			const root = character.FindFirstChild("HumanoidRootPart");
			if (!root || !root.IsA("BasePart")) return;
			const fallbackDirection = root.CFrame.LookVector;
			const target = mouse.Hit.Position;
			const aimVector = target.sub(root.Position);
			const direction = aimVector.Magnitude > 1e-4 ? aimVector.Unit : fallbackDirection;
			const origin = root.Position.add(direction.mul(2));
			this.enqueue({ kind: "fire", origin, direction });
		};

		const onCharacter = (character: Model) => {
			this.enqueue({ kind: "character", character });
			currentTool = undefined;

			const refreshTool = () => {
				const equipped = character.FindFirstChildOfClass("Tool");
				if (equipped && equipped.Name === TOOL_NAME) {
					if (currentTool !== equipped) {
						currentTool = equipped;
						equipped.Activated.Connect(() => onToolActivated(character));
					}
				} else if (currentTool && currentTool.Parent !== character) {
					currentTool = undefined;
				}
			};

			character.ChildAdded.Connect(refreshTool);
			character.ChildRemoved.Connect(refreshTool);
			refreshTool();
		};

		if (localPlayer.Character) onCharacter(localPlayer.Character);
		localPlayer.CharacterAdded.Connect(onCharacter);
		localPlayer.CharacterRemoving.Connect(() => {
			this.enqueue({ kind: "character", character: undefined });
		});
		services.UserInputService.InputBegan.Connect((input, processed) => {
			if (!processed && input.KeyCode === Enum.KeyCode.R) {
				this.enqueue({ kind: "restart" });
			}
		});
	}

	restart(): void {
		this.enqueue({ kind: "restart" });
	}
}
