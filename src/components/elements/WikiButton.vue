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

<script>
import { defineComponent, computed } from "vue";
import { documentationLinks } from "@/config/documentationLinks";

export default defineComponent({
    name: "WikiButton",
    props: {
        docUrl: {
            type: String,
            required: true,
        },
    },
    setup(props) {
        const url = computed(() => {
            if (props.docUrl.startsWith("https")) {
                return props.docUrl;
            }
            return documentationLinks[props.docUrl] || "#";
        });

        return { url };
    },
});
</script>

<style scoped>
.wiki-btn-wrapper {
    float: right;
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
