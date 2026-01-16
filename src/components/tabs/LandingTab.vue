<template>
    <BaseTab tab-name="landing">
        <div class="content_wrapper">
            <div class="content_top">
                <div class="logowrapper">
                    <img src="/images/bf_logo_white.svg" alt="" />
                    <div v-html="$t('defaultWelcomeIntro')"></div>
                </div>
            </div>
            <div class="tab_sponsor" ref="sponsorContainer"></div>
            <div class="content_mid grid-row">
                <div class="column third_left text1 grid-col col4">
                    <div class="socialMediaParagraph">
                        <h2 v-html="$t('defaultCommunityHead')"></h2>
                        <div class="logoSocialMedia">
                            <img src="/images/discord-logo-color.svg" alt="Discord" class="socialMediaLogo" />
                        </div>
                        <div class="socialMediaText" v-html="$t('defaultDiscordText')"></div>
                    </div>
                    <div class="socialMediaParagraph">
                        <div class="logoSocialMedia">
                            <img src="/images/reddit-logo.svg" alt="Reddit" class="socialMediaLogo" />
                        </div>
                        <div class="socialMediaText" v-html="$t('defaultRedditText')"></div>
                    </div>
                    <div class="socialMediaParagraph">
                        <div class="logoSocialMedia">
                            <img src="/images/flogo_RGB_HEX-1024.svg" alt="Facebook" class="socialMediaLogo" />
                        </div>
                        <div class="socialMediaText" v-html="$t('defaultFacebookText')"></div>
                    </div>
                </div>
                <div class="column third_center text3 grid-col col4">
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
                <div class="column third_right text2 list grid-col col4">
                    <div class="wrap">
                        <h2 v-html="$t('defaultContributingHead')"></h2>
                        <div v-html="$t('defaultContributingText')"></div>
                    </div>
                </div>
                <div class="column third_left text1 grid-col col4">
                    <div class="wrap">
                        <h2 v-html="$t('statisticsDisclaimerHead')"></h2>
                        <div class="statsCollection" v-html="$t('statisticsDisclaimer')"></div>
                    </div>
                </div>
                <div class="column third_center text2 grid-col col4">
                    <div class="wrap">
                        <h2 v-html="$t('defaultSoftwareHead')"></h2>
                        <div v-html="$t('defaultSoftwareText')"></div>
                    </div>
                </div>
                <div class="column third_right text1 list grid-col col4">
                    <div class="wrap">
                        <h2 v-html="$t('defaultHardwareHead')"></h2>
                        <div v-html="$t('defaultHardwareText')"></div>
                    </div>
                </div>
            </div>
            <div class="content_foot">
                <div class="languageSwitcher">
                    <span>{{ $t("language_choice_message") }}</span
                    ><br />
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

<style lang="less">
.tab-landing {
    display: flex;
    min-height: 100%;
    background: var(--surface-100) url(../../images/pattern_light.png);
    background-size: 300px;
    overflow: hidden;
}
</style>

<style scoped lang="less">
.content_wrapper {
    display: flex;
    flex-direction: column;
    padding: 0;
    height: unset;
    overflow-y: auto;
}

.content_top {
    height: 140px;
    padding: 20px;
    margin-bottom: 15px;
}

.text1,
.text2,
.text3 {
    margin-top: 15px;
    margin-bottom: 15px;
    font-weight: normal;
    font-size: 12px;
}

.content_mid {
    background-color: var(--surface-100);
    overflow: hidden;
    padding: 0 15px;
    margin-top: auto;

    .column {
        .wrap2 {
            padding: 10px;
        }
    }

    h2 {
        margin-bottom: 5px;
        font-size: 13px;
    }

    h3 {
        font-size: 12px;
        margin-bottom: 5px;
    }

    :deep(.list) {
        ul {
            margin-top: 2px;
            padding-left: 20px;
            list-style: inside;
        }
        li {
            padding: 2px 0;
            list-style-type: disc;
            margin-left: 0;
            display: list-item;
        }
    }

    .text3 {
        .wrap2 {
            border: 3px solid var(--surface-300);
            border-radius: 5px;
            min-height: 187px;
            font-size: 11px;
        }
        .donate {
            margin-top: 10px;
            text-align: center;
        }
    }
}

.content_foot {
    clear: both;
    padding: 10px 0 5px;
}

.logowrapper {
    margin-left: auto;
    margin-right: auto;
    margin-top: 5px;
    width: 800px;
    color: var(--text);
    font-size: 14px;
    font-weight: 300;
    text-align: center;

    > div {
        text-align: center;
    }

    img {
        width: 600px;
        margin: 5px;
    }

    span {
        font-size: 22px;
        font-weight: 300;
    }
}

.socialMediaParagraph {
    margin-bottom: 15px;

    .logoSocialMedia {
        float: left;
        width: 30px;

        img {
            height: 20px;
            width: 20px;
        }
    }

    .socialMediaLogo {
        padding-top: 3px;
    }

    .socialMediaText {
        margin-top: 0;
        margin-left: 35px;
        display: block;
        font-weight: normal;
        font-size: 12px;
    }
}

.languageSwitcher {
    margin-left: auto;
    margin-right: auto;
    text-align: center;

    .selected_language {
        font-weight: bold;
    }

    a {
        font-weight: normal;
        white-space: nowrap;
        margin-left: 8px;

        &:not(:last-child) {
            &:after {
                content: ", ";
                font-weight: normal;
            }
        }
    }
}

@media all and (max-width: 575px) {
    .logowrapper {
        width: auto;
        img {
            width: auto;
        }
    }
}
</style>
