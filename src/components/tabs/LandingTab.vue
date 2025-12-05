<template>
    <BaseTab tab-name="landing">
        <div class="content_wrapper">
            <div class="content_top">
                <div class="logowrapper" align="center">
                    <img src="/images/bf_logo_white.svg" alt="" />
                    <div align="center" v-html="$t('defaultWelcomeIntro')"></div>
                </div>
            </div>
            <div class="tab_sponsor" ref="sponsorContainer"></div>
            <div class="content_mid grid-row">
                <div class="column third_left text1 grid-col col4">
                    <div class="wrap">
                        <h2 v-html="$t('defaultWelcomeHead')"></h2>
                        <div v-html="$t('defaultWelcomeText')"></div>
                    </div>
                </div>
                <div class="column third_center text2 grid-col col5">
                    <div class="wrap">
                        <h2 v-html="$t('defaultContributingHead')"></h2>
                        <div v-html="$t('defaultContributingText')"></div>
                    </div>
                </div>
                <div class="column third_right text3 grid-col col3">
                    <div class="wrap2">
                        <h3 v-html="$t('defaultDonateHead')"></h3>
                        <div v-html="$t('defaultDonateText')"></div>
                        <div class="donate">
                            <a
                                href="https://paypal.me/betaflight"
                                rel="noopener noreferrer"
                                target="_blank"
                                :title="$t('defaultDonate')"
                            >
                                <img src="/images/btn-donate.png" alt="Paypal" height="30" />
                            </a>
                        </div>
                        <div v-html="$t('defaultDonateBottom')"></div>
                    </div>
                </div>
                <div class="content_mid_bottom">
                    <div class="socialMediaParagraph">
                        <div class="logoSocialMedia">
                            <img src="/images/flogo_RGB_HEX-1024.svg" alt="Facebook" class="facebookLogo" />
                        </div>
                        <div class="socialMediaText" v-html="$t('defaultFacebookText')"></div>
                    </div>
                    <div class="socialMediaParagraph">
                        <div class="logoSocialMedia">
                            <img src="/images/discord-logo-color.svg" alt="Discord" class="discordLogo" />
                        </div>
                        <div class="socialMediaText" v-html="$t('defaultDiscordText')"></div>
                    </div>
                </div>
                <div class="content_bottom">
                    <div class="statsCollection" v-html="$t('statisticsDisclaimer')"></div>
                </div>
                <div class="content_foot">
                    <div class="languageSwitcher">
                        <span>{{ $t("language_choice_message") }}</span>
                        <a
                            v-for="lang in availableLanguages"
                            :key="lang"
                            href="#"
                            :lang="lang"
                            :class="{ selected_language: lang === selectedLanguage }"
                            @click.prevent="changeLanguage(lang)"
                        >
                            {{ $t(`language_${lang}`) }}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, onMounted } from "vue";
import $ from "jquery";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import Sponsor from "../../js/Sponsor";

export default defineComponent({
    name: "LandingTab",
    components: {
        BaseTab,
    },
    setup() {
        const sponsorContainer = ref(null);
        const sponsor = new Sponsor();

        // Get available languages including DEFAULT
        const availableLanguages = ref(["DEFAULT", ...i18n.getLanguagesAvailables()]);
        const selectedLanguage = ref(i18n.selectedLanguage);

        function changeLanguage(lang) {
            if (i18n.selectedLanguage !== lang) {
                i18n.changeLanguage(lang);
                selectedLanguage.value = lang;
            }
        }

        onMounted(() => {
            // Load sponsor tile - wrap with jQuery for Sponsor.js compatibility
            if (sponsorContainer.value) {
                sponsor.loadSponsorTile("landing", $(sponsorContainer.value));
            }
            GUI.content_ready();
        });

        return {
            sponsorContainer,
            availableLanguages,
            selectedLanguage,
            changeLanguage,
        };
    },
});
</script>

<style scoped>
.selected_language {
    font-weight: bold;
}
.languageSwitcher a {
    margin-left: 8px;
}
</style>
