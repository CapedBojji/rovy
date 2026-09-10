import { textLabel, ui, $eventTrigger, type UiNode } from "@rovy/ui";
import type { EventReader } from "@rovy/core";
import type { DocumentChanged, DocumentSaved } from "@rovy/datastore";
import { Profile } from "./documents";
import { ProfileFieldChanged } from "./events";

/**
 * Render counters live outside the components so the runner can read them
 * without reaching into `@rovy/ui` internals. A rerender is only observable as
 * "render() ran again", so counting it is the assertion.
 */
export const renderCounts = {
	documentChanged: 0,
	documentSaved: 0,
	classEvent: 0,
};

export function resetRenderCounts(): void {
	renderCounts.documentChanged = 0;
	renderCounts.documentSaved = 0;
	renderCounts.classEvent = 0;
}

/**
 * `DocumentChanged` is a type, not a class: `@rovy/datastore` keys its document
 * events off a transformer-generated document id, so there is no constructor to
 * hand to `$eventTrigger`. Naming the type lets the transformer resolve the same
 * constructor the `EventReader` param below resolves to.
 */
@ui
export class CoinsLabel {
	static rerender = [$eventTrigger<DocumentChanged<typeof Profile>>()];

	render(changed: EventReader<DocumentChanged<typeof Profile>>): UiNode {
		renderCounts.documentChanged += 1;
		return textLabel({
			Name: "CoinsLabel",
			Text: `changed=${changed.size()} renders=${renderCounts.documentChanged}`,
		});
	}
}

@ui
export class SavedLabel {
	static rerender = [$eventTrigger<DocumentSaved<typeof Profile>>()];

	render(saved: EventReader<DocumentSaved<typeof Profile>>): UiNode {
		renderCounts.documentSaved += 1;
		return textLabel({
			Name: "SavedLabel",
			Text: `saved=${saved.size()} renders=${renderCounts.documentSaved}`,
		});
	}
}

/** Class-constructor trigger: the branch `@rovy/scribe` events take. */
@ui
export class FieldLabel {
	static rerender = [$eventTrigger(ProfileFieldChanged)];

	render(changes: EventReader<ProfileFieldChanged>): UiNode {
		renderCounts.classEvent += 1;
		return textLabel({
			Name: "FieldLabel",
			Text: `fields=${changes.size()} renders=${renderCounts.classEvent}`,
		});
	}
}
