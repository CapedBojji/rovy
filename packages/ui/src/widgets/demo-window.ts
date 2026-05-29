import { widget, __useState } from "../runtime";
import { c, v2 } from "../primitives";
import { darkStyle, lightStyle, setStyle } from "../style";
import { window } from "./window";
import { button } from "./button";
import { checkbox } from "./checkbox";
import { slider } from "./slider";
import { input } from "./input";
import { label } from "./label";
import { heading } from "./heading";
import { separator } from "./separator";
import { row } from "./row";
import { space } from "./space";
import { radioButton } from "./radio-button";
import { selectableLabel } from "./selectable-label";
import { comboBox } from "./combo-box";
import { dragValue } from "./drag-value";
import { progressBar } from "./progress-bar";
import { collapsingHeader } from "./collapsing-header";
import { toggle } from "./toggle";
import { clickableLabel } from "./clickable-label";
import { modal } from "./modal";
import { popup } from "./popup";
import { childWindow } from "./child-window";
import { uiTable } from "./table";
import { tableRow } from "./table-row";
import { tableCell } from "./table-cell";
import { tableExplorer, type TableExplorerNode } from "./table-explorer";

interface DemoEntryOptions {
	height?: number;
}

const tableExplorerSample: ReadonlyArray<TableExplorerNode> = [
	{
		key: "player",
		typeLabel: "table",
		preview: "{4 keys}",
		children: [
			{ key: "name", typeLabel: "string", preview: "Aria" },
			{ key: "level", typeLabel: "number", preview: "12" },
			{ key: "alive", typeLabel: "boolean", preview: "true" },
			{
				key: "stats",
				typeLabel: "table",
				preview: "{3 keys}",
				children: [
					{ key: "health", typeLabel: "number", preview: "85" },
					{ key: "mana", typeLabel: "number", preview: "40" },
					{ key: "position", typeLabel: "Vector3", preview: "Vector3(10, 0, -4)" },
				],
			},
		],
	},
	{
		key: "inventory",
		typeLabel: "table",
		preview: "{2 keys}",
		children: [
			{ key: "gold", typeLabel: "number", preview: "999" },
			{
				key: "items",
				typeLabel: "table",
				preview: "{50 keys}",
				truncated: true,
				children: [
					{ key: "sword", typeLabel: "string", preview: "Excalibur" },
					{ key: "shield", typeLabel: "string", preview: "Aegis" },
				],
			},
		],
	},
	{ key: "self", typeLabel: "table", preview: "{1 key}", cycle: true },
	{ key: "version", typeLabel: "string", preview: "1.0.0" },
];

/** @widget */
export const demoWindow = widget((): void => {
	const [activeTab, setActiveTab] = __useState("demo:activeTab", "Gallery");
	const [themeMode, setThemeMode] = __useState<"dark" | "light">("demo:themeMode", "dark");

	const [clickCount, setClickCount] = __useState("demo:clickCount", 0);
	const [cb1, setCb1] = __useState("demo:cb1", false);
	const [cb2, setCb2] = __useState("demo:cb2", true);
	const [sliderVal1, setSliderVal1] = __useState("demo:sliderVal1", 0);
	const [sliderVal2, setSliderVal2] = __useState("demo:sliderVal2", 50);
	const [inputText, setInputText] = __useState("demo:inputText", "");
	const [submitLog, setSubmitLog] = __useState("demo:submitLog", "");
	const [radioChoice, setRadioChoice] = __useState("demo:radioChoice", "First");
	const [selectableTab, setSelectableTab] = __useState("demo:selectableTab", 1);
	const [comboSelected, setComboSelected] = __useState("demo:comboSelected", "First");
	const [dragVal, setDragVal] = __useState("demo:dragVal", 112);
	const [progressVal, setProgressVal] = __useState("demo:progressVal", 0.31);
	const [toggleOn, setToggleOn] = __useState("demo:toggleOn", false);
	const [galleryTableEnabled, setGalleryTableEnabled] = __useState("demo:galleryTableEnabled", true);

	const [rowDemoOpen, setRowDemoOpen] = __useState("demo:rowDemoOpen", false);
	const [rowDemoCentered, setRowDemoCentered] = __useState("demo:rowDemoCentered", false);
	const [rowDemoTight, setRowDemoTight] = __useState("demo:rowDemoTight", false);

	const [windowDemoOpen, setWindowDemoOpen] = __useState("demo:windowDemoOpen", false);
	const [winClosable, setWinClosable] = __useState("demo:winClosable", true);
	const [winMinimizable, setWinMinimizable] = __useState("demo:winMinimizable", true);
	const [winMovable, setWinMovable] = __useState("demo:winMovable", true);
	const [winResizable, setWinResizable] = __useState("demo:winResizable", true);
	const [winScrollX, setWinScrollX] = __useState("demo:winScrollX", false);
	const [winScrollY, setWinScrollY] = __useState("demo:winScrollY", true);

	const [childDemoOpen, setChildDemoOpen] = __useState("demo:childDemoOpen", false);
	const [childTitleInput, setChildTitleInput] = __useState("demo:childTitleInput", "Scrollable Section");
	const [childHeight, setChildHeight] = __useState("demo:childHeight", 120);
	const [childMinimizable, setChildMinimizable] = __useState("demo:childMinimizable", true);
	const [childScrollX, setChildScrollX] = __useState("demo:childScrollX", false);
	const [childScrollY, setChildScrollY] = __useState("demo:childScrollY", true);

	const [popupDemoOpen, setPopupDemoOpen] = __useState("demo:popupDemoOpen", false);
	const [popupVisible, setPopupVisible] = __useState("demo:popupVisible", false);
	const [popupExplicitPosition, setPopupExplicitPosition] = __useState("demo:popupExplicitPosition", false);

	const [modalDemoOpen, setModalDemoOpen] = __useState("demo:modalDemoOpen", false);
	const [modalVisible, setModalVisible] = __useState("demo:modalVisible", false);
	const [modalClosable, setModalClosable] = __useState("demo:modalClosable", true);
	const [modalResult, setModalResult] = __useState("demo:modalResult", "");

	const [tableDemoOpen, setTableDemoOpen] = __useState("demo:tableDemoOpen", false);
	const [tableBorders, setTableBorders] = __useState("demo:tableBorders", true);
	const [tableStripeRows, setTableStripeRows] = __useState("demo:tableStripeRows", true);
	const [tableStripeColumns, setTableStripeColumns] = __useState("demo:tableStripeColumns", false);
	const [tableUseWideName, setTableUseWideName] = __useState("demo:tableUseWideName", false);
	const [tableFeatureEnabled, setTableFeatureEnabled] = __useState("demo:tableFeatureEnabled", true);
	const [tableActionCount, setTableActionCount] = __useState("demo:tableActionCount", 0);
	const [tableTuning, setTableTuning] = __useState("demo:tableTuning", 25);
	const [tableExplorerDemoOpen, setTableExplorerDemoOpen] = __useState("demo:tableExplorerDemoOpen", false);

	const renderDemoEntry = (
		title: string,
		open: boolean,
		setOpen: (v: boolean) => void,
		fn: () => void,
		entryOptions: DemoEntryOptions = {},
	): void => {
		childWindow(
			{
				title,
				height: entryOptions.height ?? 110,
				minimizable: true,
				scrollY: true,
			},
			() => {
				row(() => {
					if (button(open ? "Close" : "Open", { width: 80 }).clicked()) {
						setOpen(!open);
					}
					label(open ? "Status: Open" : "Status: Closed", {
						color: open ? c(100, 220, 100) : c(170, 170, 170),
					});
				});

				space(4);
				fn();
			},
		);
	};

	setStyle(themeMode === "dark" ? darkStyle : lightStyle);

	window(
		{
			title: "Widget Gallery",
			closable: false,
			minimizable: true,
			movable: true,
			resizable: true,
			size: v2(400, 660),
			position: v2(30, 30),
		},
		() => {
			heading("Demo Window");
			separator();

			row({ padding: 6 }, () => {
				for (const tabName of ["Gallery", "Demos"]) {
					const captured = tabName;
					if (selectableLabel(tabName, { selected: activeTab === tabName }).clicked()) {
						setActiveTab(captured);
					}
				}
				label("  Theme:");
				for (const mode of ["dark", "light"] as const) {
					const captured = mode;
					if (selectableLabel(mode, { selected: themeMode === mode }).clicked()) {
						setThemeMode(captured);
					}
				}
			});

			space(6);

			if (activeTab === "Gallery") {
				label("Broad widget reference. Open Demos tab for side-by-side playgrounds.");
				space(6);

				heading("Label");
				separator();
				label("Welcome to widget gallery!");
				label("Muted text", { color: c(128, 128, 128) });
				label("This is longer piece of text that wraps when it reaches edge of window.", { wrapped: true });

				space(6);

				heading("Button");
				separator();
				if (button("Click me!").clicked()) {
					setClickCount(clickCount + 1);
				}
				label(`Clicked ${clickCount} time(s)`);

				row(() => {
					button("Small A", { width: 90 });
					button("Disabled", { width: 90, disabled: true });
				});

				space(6);

				heading("ClickableLabel");
				separator();
				if (clickableLabel("View source on GitHub ->").clicked()) {
					setClickCount(clickCount + 1);
				}

				space(6);

				heading("Checkbox");
				separator();
				if (checkbox("Click to toggle", { checked: cb1 }).clicked()) {
					setCb1(!cb1);
				}
				if (checkbox("Pre-checked", { checked: cb2 }).clicked()) {
					setCb2(!cb2);
				}
				checkbox("Disabled", { checked: true, disabled: true });

				space(6);

				heading("RadioButton");
				separator();
				for (const opt of ["First", "Second", "Third"]) {
					const capturedOpt = opt;
					if (radioButton(opt, { selected: radioChoice === opt }).clicked()) {
						setRadioChoice(capturedOpt);
					}
				}
				label(`Selected: ${radioChoice}`);

				space(6);

				heading("SelectableLabel");
				separator();
				row(() => {
					const names = ["First", "Second", "Third"];
					for (let i = 1; i <= names.size(); i++) {
						const capturedIndex = i;
						if (selectableLabel(names[i - 1], { selected: selectableTab === i }).clicked()) {
							setSelectableTab(capturedIndex);
						}
					}
				});
				label(`Tab: ${selectableTab}`);

				space(6);

				heading("ComboBox");
				separator();
				const combo = comboBox({ items: ["First", "Second", "Third", "Fourth", "Fifth"] });
				if (combo.changed()) {
					setComboSelected(combo.value());
				}
				label(`Pick: ${comboSelected}`);

				space(6);

				heading("Slider");
				separator();
				const alphaValue = slider({ min: 0, max: 1, initial: sliderVal1, label: "Alpha" });
				setSliderVal1(alphaValue);

				const speedValue = slider({ min: 0, max: 100, initial: sliderVal2, label: "Speed" });
				setSliderVal2(speedValue);

				space(6);

				heading("DragValue");
				separator();
				const nextDragValue = dragValue({ min: -200, max: 200, initial: dragVal, step: 1, label: "Value" });
				setDragVal(nextDragValue);

				space(6);

				heading("ProgressBar");
				separator();
				progressBar({ value: progressVal });
				label(`${math.floor(progressVal * 100)}%`);
				row(() => {
					if (button("-10%", { width: 60 }).clicked()) {
						setProgressVal(math.max(0, progressVal - 0.1));
					}
					if (button("+10%", { width: 60 }).clicked()) {
						setProgressVal(math.min(1, progressVal + 0.1));
					}
				});

				space(6);

				heading("Toggle");
				separator();
				if (toggle("Enable feature", { on: toggleOn }).clicked()) {
					setToggleOn(!toggleOn);
				}
				toggle("Disabled toggle", { on: true, disabled: true });

				space(6);

				heading("TextEdit");
				separator();
				const handle = input({ placeholder: "Write something here", label: "Text" });
				if (handle.changed()) {
					setInputText(handle.value());
				}
				if (handle.submitted()) {
					setSubmitLog(`Submitted: ${handle.value()}`);
				}
				if (inputText !== "") {
					label(`Live: ${inputText}`);
				}
				if (submitLog !== "") {
					label(submitLog, { color: c(100, 220, 100) });
				}

				space(6);

				heading("Separator");
				separator();
				label("Above");
				separator();
				label("Below");

				space(6);

				heading("Row");
				separator();
				row(() => {
					button("A");
					button("B");
					button("C");
				});

				space(6);

				heading("CollapsingHeader");
				separator();
				collapsingHeader("Click to see what is hidden!", () => {
					label("You found hidden content!");
					label("Sliders work inside collapsing headers too.");
					slider({ min: 0, max: 10, label: "Inner" });
				});

				space(6);

				heading("ChildWindow");
				separator();
				childWindow({ title: "Inline Child Window", height: 100, minimizable: true }, () => {
					for (let i = 1; i <= 8; i++) {
						label(`Row ${i}`);
					}
				});

				space(6);

				heading("Table");
				separator();
				uiTable(
					{
						header: true,
						borders: true,
						stripeRows: true,
						rowHeight: 30,
						columns: [{ width: 110 }, { fill: true }, { width: 80 }],
					},
					() => {
						tableRow(() => {
							tableCell(() => label("Widget"));
							tableCell(() => label("Preview"));
							tableCell(() => label("Live"));
						});

						tableRow(() => {
							tableCell(() => label("Checkbox"));
							tableCell(() => label("Nested widget inside cell"));
							tableCell(() => {
								if (checkbox("On", { checked: galleryTableEnabled }).clicked()) {
									setGalleryTableEnabled(!galleryTableEnabled);
								}
							});
						});
					},
				);
			} else {
				label("Open side demos. Each entry has own controls and test window.");
				space(6);

				childWindow(
					{
						title: "Demo Browser",
						height: 560,
						minimizable: true,
						scrollY: true,
					},
					() => {
						collapsingHeader("Layout", () => {
							renderDemoEntry("Row Demo", rowDemoOpen, setRowDemoOpen, () => {
								if (checkbox("Center align", { checked: rowDemoCentered }).clicked()) {
									setRowDemoCentered(!rowDemoCentered);
								}
								if (checkbox("Tight padding", { checked: rowDemoTight }).clicked()) {
									setRowDemoTight(!rowDemoTight);
								}
							});
						});

						collapsingHeader("Windows", () => {
							renderDemoEntry(
								"Window Demo",
								windowDemoOpen,
								setWindowDemoOpen,
								() => {
									if (checkbox("closable", { checked: winClosable }).clicked()) setWinClosable(!winClosable);
									if (checkbox("minimizable", { checked: winMinimizable }).clicked())
										setWinMinimizable(!winMinimizable);
									if (checkbox("movable", { checked: winMovable }).clicked()) setWinMovable(!winMovable);
									if (checkbox("resizable", { checked: winResizable }).clicked())
										setWinResizable(!winResizable);
									if (checkbox("scrollX", { checked: winScrollX }).clicked()) setWinScrollX(!winScrollX);
									if (checkbox("scrollY", { checked: winScrollY }).clicked()) setWinScrollY(!winScrollY);
								},
								{ height: 180 },
							);

							renderDemoEntry(
								"ChildWindow Demo",
								childDemoOpen,
								setChildDemoOpen,
								() => {
									const childTitleHandle = input({ text: childTitleInput, label: "Title" });
									if (childTitleHandle.changed()) {
										setChildTitleInput(childTitleHandle.value());
									}

									const nextChildHeight = slider({
										min: 80,
										max: 220,
										initial: childHeight,
										label: "Height",
									});
									setChildHeight(math.floor(nextChildHeight + 0.5));

									if (checkbox("minimizable", { checked: childMinimizable }).clicked()) {
										setChildMinimizable(!childMinimizable);
									}
									if (checkbox("scrollX", { checked: childScrollX }).clicked()) {
										setChildScrollX(!childScrollX);
									}
									if (checkbox("scrollY", { checked: childScrollY }).clicked()) {
										setChildScrollY(!childScrollY);
									}
								},
								{ height: 210 },
							);
						});

						collapsingHeader("Overlays", () => {
							renderDemoEntry("Popup Demo", popupDemoOpen, setPopupDemoOpen, () => {
								if (checkbox("popup visible", { checked: popupVisible }).clicked()) {
									setPopupVisible(!popupVisible);
								}
								if (checkbox("explicit position", { checked: popupExplicitPosition }).clicked()) {
									setPopupExplicitPosition(!popupExplicitPosition);
								}
							});

							renderDemoEntry("Modal Demo", modalDemoOpen, setModalDemoOpen, () => {
								if (checkbox("closable", { checked: modalClosable }).clicked()) {
									setModalClosable(!modalClosable);
								}
								if (button("Open modal", { width: 100 }).clicked()) {
									setModalVisible(true);
									setModalResult("");
								}
								if (modalResult !== "") {
									label(modalResult, { color: c(100, 220, 100) });
								}
							});
						});

						collapsingHeader("Data", () => {
							renderDemoEntry(
								"Table Demo",
								tableDemoOpen,
								setTableDemoOpen,
								() => {
									if (checkbox("borders", { checked: tableBorders }).clicked()) {
										setTableBorders(!tableBorders);
									}
									if (checkbox("stripe rows", { checked: tableStripeRows }).clicked()) {
										setTableStripeRows(!tableStripeRows);
									}
									if (checkbox("stripe cols", { checked: tableStripeColumns }).clicked()) {
										setTableStripeColumns(!tableStripeColumns);
									}
									if (checkbox("wide first col", { checked: tableUseWideName }).clicked()) {
										setTableUseWideName(!tableUseWideName);
									}
								},
								{ height: 150 },
							);
							renderDemoEntry(
								"Table Explorer Demo",
								tableExplorerDemoOpen,
								setTableExplorerDemoOpen,
								() => {
									label("Navigable value-tree explorer. Open to launch.");
								},
							);
						});
					},
				);
			}
		},
	);

	if (rowDemoOpen) {
		const rowDemoWindow = window(
			{
				title: "Row Demo",
				closable: true,
				minimizable: true,
				movable: true,
				resizable: true,
				size: v2(330, 250),
				position: v2(460, 30),
			},
			() => {
				label("Use Demos tab controls to change alignment and padding.");
				space(6);

				heading("Equal fill");
				separator();
				row(
					{
						padding: rowDemoTight ? 4 : 8,
						alignment: rowDemoCentered ? Enum.HorizontalAlignment.Center : Enum.HorizontalAlignment.Left,
					},
					() => {
						button("A");
						button("B");
						button("C");
					},
				);

				space(6);

				heading("Mixed fixed + fill");
				separator();
				row(
					{
						padding: rowDemoTight ? 4 : 8,
						alignment: rowDemoCentered ? Enum.HorizontalAlignment.Center : Enum.HorizontalAlignment.Left,
					},
					() => {
						button("80px", { width: 80 });
						button("Fill");
					},
				);

				space(6);

				heading("Footer");
				separator();
				row(
					{
						padding: rowDemoTight ? 4 : 8,
						alignment: rowDemoCentered ? Enum.HorizontalAlignment.Center : Enum.HorizontalAlignment.Left,
					},
					() => {
						button("Confirm", { width: 100 });
						button("Cancel", { width: 100 });
					},
				);
			},
		);

		if (rowDemoWindow.closed()) {
			setRowDemoOpen(false);
		}
	}

	if (windowDemoOpen) {
		const windowDemo = window(
			{
				title: "Window Demo",
				closable: winClosable,
				minimizable: winMinimizable,
				movable: winMovable,
				resizable: winResizable,
				scrollX: winScrollX,
				scrollY: winScrollY,
				size: v2(320, 260),
				position: v2(460, 300),
			},
			() => {
				label("Double-click title bar to minimize.");
				label("Drag still works when movable enabled.");
				space(6);
				for (let i = 1; i <= 8; i++) {
					label(`Window content row ${i}`);
				}
				if (winScrollX) {
					label("Very long horizontal line to test scroll width -> 1234567890 ABCDEFGHIJKLMNOPQRSTUVWXYZ", {
						wrapped: false,
					});
				}
			},
		);

		if (windowDemo.closed()) {
			setWindowDemoOpen(false);
		}
	}

	if (childDemoOpen) {
		const childDemoWindow = window(
			{
				title: "ChildWindow Demo Host",
				closable: true,
				minimizable: true,
				movable: true,
				resizable: true,
				size: v2(340, 290),
				position: v2(800, 30),
			},
			() => {
				label("Single-click child header to minimize.");
				space(6);
				childWindow(
					{
						title: childTitleInput !== "" ? childTitleInput : "Child Demo",
						height: childHeight,
						minimizable: childMinimizable,
						scrollX: childScrollX,
						scrollY: childScrollY,
					},
					() => {
						for (let i = 1; i <= 10; i++) {
							label(`Child row ${i}`);
						}
						if (childScrollX) {
							label("Horizontal scroll sample -> 1234567890 ABCDEFGHIJKLMNOPQRSTUVWXYZ", { wrapped: false });
						}
					},
				);
			},
		);

		if (childDemoWindow.closed()) {
			setChildDemoOpen(false);
		}
	}

	if (popupDemoOpen) {
		const popupDemoWindow = window(
			{
				title: "Popup Demo",
				closable: true,
				minimizable: true,
				movable: true,
				resizable: true,
				size: v2(300, 190),
				position: v2(800, 340),
			},
			() => {
				label("Anchor popup in window or force explicit position.");
				space(6);
				if (button(popupVisible ? "Hide popup" : "Show popup", { width: 110 }).clicked()) {
					setPopupVisible(!popupVisible);
				}

				popup(
					{
						open: popupVisible,
						position: popupExplicitPosition ? v2(920, 410) : undefined,
					},
					() => {
						label("Popup menu");
						separator();
						if (clickableLabel("Action A").clicked()) {
							setPopupVisible(false);
						}
						if (clickableLabel("Action B").clicked()) {
							setPopupVisible(false);
						}
					},
				);
			},
		);

		if (popupDemoWindow.closed()) {
			setPopupDemoOpen(false);
			setPopupVisible(false);
		}
	}

	if (modalDemoOpen) {
		const modalDemoWindow = window(
			{
				title: "Modal Demo",
				closable: true,
				minimizable: true,
				movable: true,
				resizable: true,
				size: v2(300, 180),
				position: v2(460, 580),
			},
			() => {
				label("Modal opens above whole UI.");
				space(6);
				if (button("Open modal", { width: 110 }).clicked()) {
					setModalVisible(true);
					setModalResult("");
				}
				if (modalResult !== "") {
					label(modalResult, { color: c(100, 220, 100) });
				}
			},
		);

		if (modalDemoWindow.closed()) {
			setModalDemoOpen(false);
			setModalVisible(false);
		}
	}

	const modalHandle = modal(
		{
			title: "Demo Modal",
			open: modalDemoOpen && modalVisible,
			closable: modalClosable,
		},
		() => {
			label("Modal widget test content.");
			label("Use Demos tab to toggle closable state.");
			space(6);
			row(() => {
				if (button("Confirm", { width: 100 }).clicked()) {
					setModalVisible(false);
					setModalResult("Confirmed!");
				}
				if (button("Cancel", { width: 100 }).clicked()) {
					setModalVisible(false);
					setModalResult("Cancelled.");
				}
			});
		},
	);

	if (modalHandle.closed()) {
		setModalVisible(false);
		setModalResult("Closed from title bar.");
	}

	if (tableDemoOpen) {
		const tableDemoWindow = window(
			{
				title: "Table Demo",
				closable: true,
				minimizable: true,
				movable: true,
				resizable: true,
				size: v2(420, 260),
				position: v2(860, 30),
			},
			() => {
				label("Cells can host widgets. Toggle styling from Demos tab.");
				space(6);

				uiTable(
					{
						header: true,
						borders: tableBorders,
						stripeRows: tableStripeRows,
						stripeColumns: tableStripeColumns,
						columns: tableUseWideName
							? [{ width: 150 }, { fill: true }, { auto: true }]
							: [{ width: 110 }, { fill: true }, { auto: true }],
					},
					() => {
						tableRow(() => {
							tableCell(() => label("Setting"));
							tableCell(() => label("Preview"));
							tableCell(() => label("Action"));
						});

						tableRow(() => {
							tableCell(() => label("Feature Flag"));
							tableCell(() => label("Checkbox widget in cell"));
							tableCell(() => {
								if (checkbox("Enabled", { checked: tableFeatureEnabled }).clicked()) {
									setTableFeatureEnabled(!tableFeatureEnabled);
								}
							});
						});

						tableRow(() => {
							tableCell(() => label("Tuning"));
							tableCell(() => label("Slider widget in cell"));
							tableCell(() => {
								const nextTuning = slider({
									min: 0,
									max: 100,
									initial: tableTuning,
									label: "Tune",
								});
								setTableTuning(math.floor(nextTuning + 0.5));
							});
						});

						tableRow(() => {
							tableCell(() => label("Action"));
							tableCell(() => label("Button widget in cell"));
							tableCell(() => {
								if (button("Run", { width: 70 }).clicked()) {
									setTableActionCount(tableActionCount + 1);
								}
							});
						});
					},
				);

				space(6);
				label(`Run count: ${tableActionCount}`);
			},
		);

		if (tableDemoWindow.closed()) {
			setTableDemoOpen(false);
		}
	}

	if (tableExplorerDemoOpen) {
		const explorerHandle = tableExplorer(tableExplorerSample, {
			title: "Table Explorer Demo",
			onClose: () => setTableExplorerDemoOpen(false),
		});
		if (explorerHandle.closed()) {
			setTableExplorerDemoOpen(false);
		}
	}
}, "@rovy/ui/demoWindow");
