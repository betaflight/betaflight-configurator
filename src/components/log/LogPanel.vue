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
    <Teleport to="#main-wrapper">
        <section
            v-show="navigationStore.logPanelOpen"
            ref="panel"
            class="log-panel bg-default border border-accented rounded-lg shadow-xl"
            :style="position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined"
            :aria-label="$t('tabLog')"
        >
            <header class="log-panel__header border-b border-default" @pointerdown="startDrag">
                <UIcon name="i-lucide-grip-horizontal" class="size-4 text-muted" />
                <span class="log-panel__title">{{ $t("tabLog") }}</span>
                <UTooltip v-if="canPopOut" :text="$t('logActionOpenWindow')" :delay-duration="300">
                    <UButton
                        icon="i-lucide-external-link"
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        square
                        :aria-label="$t('logActionOpenWindow')"
                        @click="popOut"
                    />
                </UTooltip>
                <UButton
                    icon="i-lucide-x"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    square
                    :aria-label="$t('close')"
                    @click="navigationStore.logPanelOpen = false"
                />
            </header>
            <div class="log-panel__body">
                <LogView ref="logView" />
            </div>
        </section>
    </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import LogView from "./LogView.vue";
import { useNavigationStore } from "@/stores/navigation";
import { openLogWindow } from "@/js/log_window";
import { isAndroid } from "@/js/utils/checkCompatibility";

const EDGE_GAP = 16;

const navigationStore = useNavigationStore();
const canPopOut = !isAndroid();
const panel = ref<HTMLElement | null>(null);
const logView = ref<InstanceType<typeof LogView> | null>(null);
const position = ref<{ x: number; y: number } | null>(null);

// The panel lives inside #main-wrapper, which the UI scale option transforms; positions are in
// its unscaled pixels while pointer events report scaled ones.
function container() {
    const wrapper = document.getElementById("main-wrapper");
    if (!wrapper) {
        return null;
    }
    return { wrapper, scale: wrapper.getBoundingClientRect().width / wrapper.offsetWidth || 1 };
}

function clamp(x: number, y: number) {
    const el = panel.value;
    const wrapper = container()?.wrapper;
    if (!el || !wrapper) {
        return { x, y };
    }
    return {
        x: Math.min(Math.max(0, x), Math.max(0, wrapper.offsetWidth - el.offsetWidth)),
        y: Math.min(Math.max(0, y), Math.max(0, wrapper.offsetHeight - el.offsetHeight)),
    };
}

function placeInitially() {
    const el = panel.value;
    const wrapper = container()?.wrapper;
    if (!el || !wrapper) {
        return;
    }
    const statusBar = document.getElementById("status-bar")?.offsetHeight ?? 0;
    position.value = clamp(
        wrapper.offsetWidth - el.offsetWidth - EDGE_GAP,
        wrapper.offsetHeight - el.offsetHeight - statusBar - EDGE_GAP,
    );
}

function startDrag(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest("button") || !position.value) {
        return;
    }
    const scale = container()?.scale ?? 1;
    const origin = { ...position.value };
    const pointer = { x: event.clientX, y: event.clientY };
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();

    const move = (e: PointerEvent) => {
        position.value = clamp(origin.x + (e.clientX - pointer.x) / scale, origin.y + (e.clientY - pointer.y) / scale);
    };
    const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
}

function keepInView() {
    if (navigationStore.logPanelOpen && position.value) {
        position.value = clamp(position.value.x, position.value.y);
    }
}

function popOut() {
    if (openLogWindow()) {
        navigationStore.logPanelOpen = false;
    }
}

watch(
    () => navigationStore.logPanelOpen,
    async (open) => {
        if (!open) {
            return;
        }
        await nextTick();
        if (position.value) {
            keepInView();
        } else {
            placeInitially();
        }
        logView.value?.scrollToBottom();
    },
);

useResizeObserver([panel, document.getElementById("main-wrapper")], keepInView);
</script>

<style lang="less">
.log-panel {
    position: fixed;
    z-index: 2050;
    display: flex;
    flex-direction: column;
    width: min(640px, calc(100% - 1rem));
    height: 320px;
    min-width: 320px;
    min-height: 160px;
    max-width: 100%;
    max-height: 100%;
    resize: both;
    overflow: hidden;

    .log-panel__header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem 0.25rem 0.75rem;
        cursor: move;
        touch-action: none;
    }

    .log-panel__title {
        flex: 1;
        font-weight: 600;
        font-size: 13px;
    }

    .log-panel__body {
        flex: 1;
        min-height: 0;
        padding: 0.5rem 0.75rem 0.75rem;
    }
}
</style>
