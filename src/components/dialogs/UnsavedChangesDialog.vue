<!--
This file is part of Betaflight.

Betaflight is free software. You can redistribute this software
and/or modify this software under the terms of the GNU General
Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later
version.

Betaflight is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

See the GNU General Public License for more details.

You should have received a copy of the GNU General Public
License along with this software.

If not, see <http://www.gnu.org/licenses/>.
-->
<template>
    <UModal :open="open" :title="title" :close="false" :dismissible="false">
        <template #body>
            <div v-html="text"></div>
        </template>
        <template #footer>
            <div class="flex flex-wrap gap-2 justify-end w-full">
                <UButton color="neutral" variant="soft" @click="$emit('stay')">{{ stayText }}</UButton>
                <UButton color="error" variant="soft" @click="$emit('leave')">{{ leaveText }}</UButton>
                <UButton v-if="canSave" color="primary" @click="$emit('save')">{{ saveText }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps({
    title: String,
    text: String,
    saveText: String,
    leaveText: String,
    stayText: String,
    /** False when the tab registered no save action, so only Leave and Stay are offered. */
    canSave: Boolean,
});

defineEmits(["save", "leave", "stay"]);

const open = ref(false);

const show = () => {
    open.value = true;
};

const close = () => {
    open.value = false;
};

defineExpose({
    show,
    close,
});
</script>
