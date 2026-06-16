import RovyUi, { button, label, useKey, viewportFrame, viewportItem, window as uiWindow } from "@rovy/ui";
import { UI_TEST_PLACE_NAME } from "shared/info";

function createGui(): ScreenGui {
	const Players = game.GetService("Players");
	const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
	const gui = new Instance("ScreenGui");
	gui.Name = "RovyUiTestPlace";
	gui.ResetOnSpawn = false;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = playerGui;
	return gui;
}

const root = RovyUi.new(createGui());
const RunService = game.GetService("RunService");

function makePart(name: string, size: Vector3, color: Color3): Part {
	const part = new Instance("Part");
	part.Name = name;
	part.Anchored = true;
	part.Material = Enum.Material.SmoothPlastic;
	part.Size = size;
	part.Color = color;
	return part;
}

function makeViewportModel(): Model {
	const model = new Instance("Model");
	model.Name = "ViewportPlaytestModel";

	const base = makePart("Base", new Vector3(2.6, 0.35, 2.6), Color3.fromRGB(32, 44, 61));
	base.CFrame = new CFrame(0, 0, 0);
	base.Parent = model;

	const core = makePart("Core", new Vector3(1.25, 1.4, 1.25), Color3.fromRGB(94, 234, 212));
	core.CFrame = new CFrame(0, 0.85, 0);
	core.Parent = model;

	const cap = makePart("Cap", new Vector3(1.8, 0.25, 1.8), Color3.fromRGB(147, 197, 253));
	cap.CFrame = new CFrame(0, 1.7, 0);
	cap.Parent = model;

	return model;
}

const model = makeViewportModel();
const accent = makePart("AccentPart", new Vector3(0.7, 2.2, 0.7), Color3.fromRGB(251, 191, 36));

RunService.RenderStepped.Connect(() => {
	const cameraPosition = new Vector3(0, 3.2, 9);
	const camera = CFrame.lookAt(cameraPosition, new Vector3(0, 0.75, 0));

	RovyUi.start(root, () => {
		uiWindow(
			{
				title: "Viewport Frame",
				position: new Vector2(72, 52),
				size: new Vector2(420, 330),
				resizable: true,
				minimizable: true,
			},
			() => {
				const frame = viewportFrame(
					{
						width: 320,
						height: 190,
						backgroundColor: Color3.fromRGB(9, 12, 18),
						border: true,
						camera: {
							cframe: camera,
							fieldOfView: 38,
						},
						freeCamera: {
							speed: 12,
							lookSensitivity: 0.22,
						},
					},
					() => {
						useKey("model");
						viewportItem({
							source: model,
							pivot: new CFrame(-1.1, 0, 0),
						});
						useKey("accent");
						viewportItem({
							source: accent,
							pivot: CFrame.Angles(0, math.rad(28), 0).add(new Vector3(1.7, 0.7, 0)),
						});
					},
				);

				const captured = frame.captured();
				if (button(captured ? "Release free cam" : "Capture free cam").clicked()) {
					if (captured) frame.releaseInput();
					else frame.captureInput();
				}
				label(`Items ${frame.itemCount()}  Free cam ${frame.captured() ? "captured" : "released"}`, { wrapped: true });
				label("Hold right mouse while captured to look. WASD, Q/E, and Space move the viewport camera. Escape releases capture.", { wrapped: true });
			},
		);
	});
});

print(`[${UI_TEST_PLACE_NAME}] client UI online`);
