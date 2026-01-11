<template>
    <div class="cf_doc_version_bt">
        <a
            id="button-documentation"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="$t('betaflightSupportButton')"
        >
            {{ $t("betaflightSupportButton") }}
        </a>
    </div>
</template>

<script>
import { defineComponent, computed } from "vue";
import { documentationLinks } from "@/config/documentationLinks";

export default defineComponent({
    name: "WikiButton",
    props: {
        // Accept either a full URL or a key to look up in documentationLinks
        docUrl: {
            type: String,
            required: true,
        },
    },
    setup(props) {
        const url = computed(() => {
            // If it's a full URL (http/https), use it directly
            // Otherwise, treat it as a key to look up in documentationLinks
            if (props.docUrl.startsWith("https")) {
                return props.docUrl;
            }
            return documentationLinks[props.docUrl] || "#";
        });

        return { url };
    },
});
</script>
