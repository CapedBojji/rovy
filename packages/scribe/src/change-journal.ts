import type {
	ScribeChangedIngress,
	ScribeIngressRecord,
} from "./ingress-collector";

export interface ScribeJournalChanged extends ScribeChangedIngress {
	readonly revision: number;
}

export type ScribeJournalRecord =
	| ScribeJournalChanged
	| Exclude<ScribeIngressRecord, ScribeChangedIngress>;

/**
 * Canonicalizes one ingress drain. Repeated leaf changes with the same
 * definition/player/path/source retain the first reliable `before`, the final
 * `after`, and their original order. Structural changes are never coalesced.
 */
export class ScribeChangeJournal {
	canonicalize(
		records: ReadonlyArray<ScribeIngressRecord>,
		revision: number,
	): ReadonlyArray<ScribeJournalRecord> {
		const output = new Array<ScribeJournalRecord>();
		for (const record of records) {
			if (record.kind !== "changed") {
				output.push(record);
				continue;
			}
			const existingIndex = findChanged(output, record);
			if (existingIndex === undefined) {
				output.push(
					table.freeze({
						...record,
						revision,
					}),
				);
				continue;
			}
			const existing = output[existingIndex] as ScribeJournalChanged;
			output[existingIndex] = table.freeze({
				...existing,
				after: record.after,
				revision,
			});
		}
		return output;
	}
}

function findChanged(
	records: ReadonlyArray<ScribeJournalRecord>,
	candidate: ScribeChangedIngress,
): number | undefined {
	for (let index = 0; index < records.size(); index += 1) {
		const record = records[index];
		if (
			record.kind === "changed" &&
			record.dataId === candidate.dataId &&
			record.player === candidate.player &&
			record.source === candidate.source &&
			samePath(record.path, candidate.path)
		) {
			return index;
		}
	}
	return undefined;
}

function samePath(
	left: ReadonlyArray<string | number>,
	right: ReadonlyArray<string | number>,
): boolean {
	if (left.size() !== right.size()) return false;
	for (let index = 0; index < left.size(); index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}
