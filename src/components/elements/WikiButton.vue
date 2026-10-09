<template>
    <div class="wiki-btn-wrapper">
        <UButton
            id="button-documentation"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="$t('betaflightSupportButton')"
            color="primary"
            variant="solid"
            class="wiki-btn uppercase font-bold tracking-wide whitespace-nowrap"
        >
            {{ $t("betaflightSupportButton") }}
        </UButton>
    </div>
</template>

<script lang="ts">
import { defineComponent, computed } from "vue";
import { documentationUrl } from "@/config/documentationLinks";

export default defineComponent({
    name: "WikiButton",
    props: {
        /** The tab key (e.g. "pid_tuning") whose wiki page to open, or a full https URL. */
        docUrl: {
            type: String,
            required: true,
        },
    },
    setup(props) {
        const url = computed(() => (props.docUrl.startsWith("https") ? props.docUrl : documentationUrl(props.docUrl)));

        return { url };
    },
});
</script>

<style scoped>
.wiki-btn-wrapper {
    float: inline-end;
    margin-top: -45px;
}

.wiki-btn {
    padding: 1px 9px;
    font-size: 10px;
    line-height: 17px;
    letter-spacing: 0.03em;
    transition: all ease 0.2s;
}
</style>
