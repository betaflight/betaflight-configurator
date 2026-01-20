<template>
    <div class="sponsor-container">
        <Transition name="fade" mode="out-in">
            <div v-if="isVisible" class="tab_sponsor" v-html="content"></div>
        </Transition>
    </div>
</template>

<script>
import { defineComponent, ref, onMounted, onBeforeUnmount } from "vue";
import BuildApi from "../../js/BuildApi";
import DarkTheme from "../../js/DarkTheme";
import GUI from "../../js/gui";
import { ispConnected } from "../../js/utils/connection";

export default defineComponent({
    name: "SponsorTile",
    props: {
        sponsorType: {
            type: String,
            required: true,
            validator: (value) => ["landing", "flash"].includes(value),
        },
    },
    setup(props) {
        const buildApi = new BuildApi();
        const content = ref("");
        const isVisible = ref(false);
        const intervalName = `sponsor_${props.sponsorType}`;

        const refresh = async () => {
            if (!ispConnected()) {
                return;
            }

            try {
                const newContent = await buildApi.loadSponsorTile(
                    DarkTheme.enabled ? "dark" : "light",
                    props.sponsorType,
                );
                if (newContent && newContent !== content.value) {
                    // Fade out
                    isVisible.value = false;
                    // Wait for fade out transition to complete
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    // Update content
                    content.value = newContent;
                    // Fade in
                    isVisible.value = true;
                    return;
                } else if (newContent) {
                    // Same content, just ensure it's visible
                    isVisible.value = true;
                    return;
                }
            } catch (error) {
                console.error("[Sponsor] Failed to load sponsor tile: ", error);
            }
            isVisible.value = false;
        };

        const pause = () => {
            GUI.interval_pause(intervalName);
        };

        const resume = () => {
            GUI.interval_resume(intervalName);
        };

        onMounted(() => {
            // Set up periodic refresh using GUI interval manager
            GUI.interval_add(
                intervalName,
                async () => {
                    await refresh();
                },
                15000,
                true,
            );
        });

        onBeforeUnmount(() => {
            // Clean up the interval when component is destroyed
            GUI.interval_remove(intervalName);
        });

        return {
            content,
            isVisible,
            pause,
            resume,
        };
    },
});
</script>

<style scoped>
.sponsor-container {
    min-height: 90px;
    position: relative;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 1.5s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
    position: absolute;
    width: 100%;
}
</style>
