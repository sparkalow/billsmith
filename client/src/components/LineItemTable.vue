<script setup lang="ts">
/**
 * Editable line-item table.
 *
 * Hours are entered as `H:MM` because that is how they have always been recorded, but
 * they are stored as integer minutes.
 */

import { computed } from 'vue';
import { parseHM, formatHM } from '@shared/duration.js';

export interface EditableLineItem {
    /** Stable key for v-for across reorders; not persisted. */
    key: string;
    work_date: string;
    description: string;
    /** Raw `H:MM` text as typed. */
    hours: string;
    source?: string;
}

const items = defineModel<EditableLineItem[]>({ required: true });

const props = defineProps<{ defaultDate?: string }>();

function isValidHours(value: string): boolean {
    try {
        parseHM(value);
        return true;
    } catch {
        return false;
    }
}

function isValidDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function rowInvalid(item: EditableLineItem): boolean {
    return !isValidHours(item.hours) || !isValidDate(item.work_date) || !item.description.trim();
}

const totalMinutes = computed(() =>
    items.value.reduce((sum, i) => sum + (isValidHours(i.hours) ? parseHM(i.hours) : 0), 0),
);

const invalidCount = computed(() => items.value.filter(rowInvalid).length);

defineExpose({ totalMinutes, invalidCount });

function addRow(): void {
    items.value = [
        ...items.value,
        {
            key: crypto.randomUUID(),
            work_date: props.defaultDate ?? new Date().toISOString().slice(0, 10),
            description: '',
            hours: '0:00',
            source: 'manual',
        },
    ];
}

function removeRow(index: number): void {
    items.value = items.value.filter((_, i) => i !== index);
}

function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= items.value.length) return;
    const next = [...items.value];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    items.value = next;
}
</script>

<template>
    <div>
        <table class="line-item-editor">
            <thead>
                <tr>
                    <th class="col-date">Date</th>
                    <th>Description</th>
                    <th class="col-hours">Hours</th>
                    <th class="col-actions"></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, index) in items" :key="item.key" :class="{ invalid: rowInvalid(item) }">
                    <td><input v-model="item.work_date" type="date" /></td>
                    <td><input v-model="item.description" type="text" placeholder="What was done" /></td>
                    <td>
                        <input
                            v-model="item.hours"
                            type="text"
                            inputmode="numeric"
                            placeholder="H:MM"
                            :title="isValidHours(item.hours) ? '' : 'Expected H:MM, e.g. 1:30'"
                        />
                    </td>
                    <td style="white-space: nowrap">
                        <button
                            class="row-move"
                            type="button"
                            title="Move up"
                            :disabled="index === 0"
                            @click="move(index, -1)"
                        >&uarr;</button>
                        <button
                            class="row-move"
                            type="button"
                            title="Move down"
                            :disabled="index === items.length - 1"
                            @click="move(index, 1)"
                        >&darr;</button>
                        <button class="btn btn-sm btn-danger" type="button" title="Remove" @click="removeRow(index)">
                            &times;
                        </button>
                    </td>
                </tr>
                <tr v-if="items.length === 0">
                    <td colspan="4" class="muted" style="padding: 1rem; text-align: center">
                        No line items yet.
                    </td>
                </tr>
            </tbody>
        </table>

        <div class="field-row" style="margin-top: .75rem; align-items: center">
            <button class="btn btn-secondary" type="button" @click="addRow">Add line item</button>
            <span class="muted">
                {{ items.length }} item{{ items.length === 1 ? '' : 's' }} ·
                {{ formatHM(totalMinutes) }} total
            </span>
            <span v-if="invalidCount" class="alert alert-error" style="margin: 0; padding: .2rem .5rem">
                {{ invalidCount }} row{{ invalidCount === 1 ? '' : 's' }} need attention
            </span>
        </div>
    </div>
</template>
