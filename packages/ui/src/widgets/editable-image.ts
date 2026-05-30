import { widget, __useEffect, __useInstance } from "../runtime";
import { create } from "../create";
import { udim2, v2 } from "../primitives";
import { useStyle } from "../style";

export interface EditableImageOptions {
	size: Vector2;
	displaySize?: UDim2;
	backgroundTransparency?: number;
}

export interface EditableImageHandle {
	readonly draw: (pixels: buffer) => boolean;
	readonly image: () => EditableImage | undefined;
	readonly label: () => ImageLabel | undefined;
	readonly error: () => string | undefined;
}

interface EditableImageRefs {
	frame: Frame;
	imageLabel: ImageLabel;
	errorLabel: TextLabel;
	editableImage?: EditableImage;
	lastError?: string;
	size?: Vector2;
	ready?: boolean;
}

function isValidImageSize(size: Vector2): boolean {
	const width = size.X;
	const height = size.Y;
	return (
		width === math.floor(width) &&
		height === math.floor(height) &&
		width >= 1 &&
		height >= 1 &&
		width <= 1024 &&
		height <= 1024
	);
}

function setError(refs: EditableImageRefs, message: string | undefined): void {
	refs.lastError = message;
	if (refs.errorLabel !== undefined) {
		refs.errorLabel.Text = message ?? "";
		refs.errorLabel.Visible = message !== undefined;
	}
	if (refs.imageLabel !== undefined) {
		refs.imageLabel.Visible = message === undefined;
	}
}

function createEditableImage(refs: EditableImageRefs, size: Vector2): void {
	if (!isValidImageSize(size)) {
		refs.ready = false;
		setError(refs, "[rovy-ui] editableImage size must be integer pixels from 1..1024");
		return;
	}

	const [serviceOk, serviceOrError] = pcall(() => game.GetService("AssetService"));
	if (!serviceOk) {
		refs.ready = false;
		setError(refs, `[rovy-ui] editableImage AssetService unavailable: ${tostring(serviceOrError)}`);
		return;
	}

	const assetService = serviceOrError as AssetService;
	const [imageOk, imageOrError] = pcall(() => assetService.CreateEditableImage({ Size: size }));
	if (!imageOk) {
		refs.ready = false;
		setError(refs, `[rovy-ui] editableImage create failed: ${tostring(imageOrError)}`);
		return;
	}

	refs.editableImage = imageOrError as EditableImage;
	const [contentOk, contentError] = pcall(() => {
		refs.imageLabel.ImageContent = Content.fromObject(refs.editableImage as RBXObject);
	});
	if (!contentOk) {
		refs.ready = false;
		setError(refs, `[rovy-ui] editableImage display failed: ${tostring(contentError)}`);
		return;
	}

	refs.ready = true;
	setError(refs, undefined);
}

/** @widget */
export const editableImage = widget((options: EditableImageOptions): EditableImageHandle => {
	const style = useStyle();
	const displaySize = options.displaySize ?? udim2(0, options.size.X, 0, options.size.Y);
	const backgroundTransparency = options.backgroundTransparency ?? 1;

	const refs = __useInstance("editableImage:instance", (rawRef) => {
		const ref = rawRef as unknown as EditableImageRefs;
		ref.size = options.size;

		const root = create("Frame", {
			[rawRef as never]: "frame",
			BackgroundColor3: style.frameBgColor,
			BackgroundTransparency: backgroundTransparency,
			BorderSizePixel: 0,
			ClipsDescendants: true,
			Size: displaySize,
			0: create("ImageLabel", {
				[rawRef as never]: "imageLabel",
				BackgroundTransparency: 1,
				BorderSizePixel: 0,
				ScaleType: Enum.ScaleType.Stretch,
				Size: udim2(1, 0, 1, 0),
			}),
			1: create("TextLabel", {
				[rawRef as never]: "errorLabel",
				BackgroundTransparency: 1,
				Font: Enum.Font.Code,
				Text: "",
				TextColor3: style.strongTextColor,
				TextSize: style.textSize,
				TextWrapped: true,
				TextXAlignment: Enum.TextXAlignment.Center,
				TextYAlignment: Enum.TextYAlignment.Center,
				Size: udim2(1, 0, 1, 0),
				Visible: false,
			}),
		});

		createEditableImage(ref, options.size);
		return root;
	}) as EditableImageRefs;

	__useEffect(
		"editableImage:cleanup",
		() => {
			return () => {
				refs.editableImage?.Destroy();
				refs.editableImage = undefined;
				refs.ready = false;
			};
		},
	);

	refs.frame.Size = displaySize;
	refs.frame.BackgroundTransparency = backgroundTransparency;
	refs.frame.BackgroundColor3 = style.frameBgColor;
	refs.errorLabel.TextColor3 = style.strongTextColor;
	refs.errorLabel.TextSize = style.textSize;

	if (refs.size !== undefined && (refs.size.X !== options.size.X || refs.size.Y !== options.size.Y)) {
		setError(refs, "[rovy-ui] editableImage size cannot change after creation");
	}

	return {
		draw: (pixels: buffer): boolean => {
			if (refs.ready !== true || refs.editableImage === undefined || refs.size === undefined) {
				setError(refs, refs.lastError ?? "[rovy-ui] editableImage unavailable");
				return false;
			}

			const expectedLength = refs.size.X * refs.size.Y * 4;
			if (buffer.len(pixels) !== expectedLength) {
				setError(
					refs,
					`[rovy-ui] editableImage buffer length ${buffer.len(pixels)} does not match ${expectedLength}`,
				);
				return false;
			}

			const [ok, err] = pcall(() => {
				refs.editableImage!.WritePixelsBuffer(v2(0, 0), refs.size!, pixels);
			});
			if (!ok) {
				setError(refs, `[rovy-ui] editableImage draw failed: ${tostring(err)}`);
				return false;
			}

			setError(refs, undefined);
			return true;
		},
		image: (): EditableImage | undefined => {
			return refs.editableImage;
		},
		label: (): ImageLabel | undefined => {
			return refs.imageLabel;
		},
		error: (): string | undefined => {
			return refs.lastError;
		},
	};
}, "@rovy/ui/editableImage");
