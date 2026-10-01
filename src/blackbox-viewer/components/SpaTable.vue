<!--
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
-->
<template>
    <UTable
        :data="data"
        :columns="columns"
        :ui="{
            base: 'w-full',
            th: 'py-1 px-1 text-xs text-center',
            td: 'py-0.5 px-1 text-xs',
            tr: 'border-b border-default',
        }"
    >
        <template #label-header>
            <span class="text-left block">Axis</span>
        </template>
        <template #label-cell="{ row }">
            <span class="font-medium text-left block">{{ row.original.label }}</span>
        </template>
        <template #mode-cell="{ row }">
            <span class="text-center block">{{ row.original.mode }}</span>
        </template>
        <template #center-cell="{ row }">
            <span class="text-center block">{{ row.original.center }}</span>
        </template>
        <template #width-cell="{ row }">
            <span class="text-center block">{{ row.original.width }}</span>
        </template>
    </UTable>
</template>

<script setup lang="ts">
import { computed } from "vue";

export interface SpaRow {
    label: string;
    mode: string | number | null;
    center: string | number | null;
    width: string | number | null;
}

const props = defineProps<{
    rows: SpaRow[];
}>();

function fmtSpa(val: string | number | null | undefined) {
    if (val == null) {
        return "-";
    }
    return typeof val === "number" ? val.toFixed(0) : String(val);
}

const columns = [
    { accessorKey: "label", header: "Axis" },
    { accessorKey: "mode", header: "Mode" },
    { accessorKey: "center", header: "Center" },
    { accessorKey: "width", header: "Width" },
];

const data = computed(() =>
    props.rows.map((row) => {
        const params = {
            ...row,
            mode: fmtSpa(row.mode),
            center: fmtSpa(row.center),
            width: fmtSpa(row.width),
        };
        return params;
    }),
);
</script>
