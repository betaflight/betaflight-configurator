<template>
    <BaseTab tab-name="landing">
        <div class="content_wrapper">
            <div class="content_top">
                <div class="logowrapper">
                    <div class="landing-brand">
                        <img class="landing-logo" src="/images/fpv_white.png" alt="GIGFPV" />
                        <div class="landing-brand-copy">Configurator</div>
                    </div>
                    <div class="landing-intro" v-html="$t('defaultWelcomeIntro')"></div>
                </div>
            </div>
            <div class="content_mid grid-row">
                <div class="column third_left text1 grid-col col6">
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
                <div class="column third_right text2 list grid-col col6">
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
                    <div class="language-links">
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
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";

export default defineComponent({
    name: "LandingTab",
    components: {
        BaseTab,
    },
    setup() {
        const availableLanguages = ref(["DEFAULT", ...i18n.getLanguagesAvailables()]);
        const selectedLanguage = ref(i18n.selectedLanguage);

        function changeLanguage(lang) {
            if (i18n.selectedLanguage !== lang) {
                i18n.changeLanguage(lang);
                selectedLanguage.value = lang;
            }
        }

        onMounted(() => {
            GUI.content_ready();
        });

        return {
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
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 170px;
    height: auto;
    padding: 20px;
    margin-bottom: 15px;
    background:
        radial-gradient(circle at 50% 0%, rgb(255 255 255 / 14%), transparent 52%),
        linear-gradient(135deg, #050505 0%, #171717 48%, #050505 100%);
    border-bottom: 1px solid rgb(255 255 255 / 12%);
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
    }
}

.content_foot {
    clear: both;
    padding: 10px 0 5px;
}

.logowrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-left: auto;
    margin-right: auto;
    margin-top: 5px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 300;
    text-align: center;

    > div {
        text-align: center;
    }

    span {
        font-size: 22px;
        font-weight: 300;
    }
}

.landing-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
}

.landing-logo {
    width: 112px;
    height: 112px;
    object-fit: contain;
}

.landing-brand-copy {
    color: #ffffff;
    font-size: 46px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1;
}

.landing-intro {
    margin-top: 8px;
    color: rgb(255 255 255 / 82%);
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

    .language-links {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
    }

    a {
        font-weight: normal;
        white-space: nowrap;

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
    }

    .landing-brand {
        flex-direction: column;
        gap: 8px;
    }

    .landing-logo {
        width: 86px;
        height: 86px;
    }

    .landing-brand-copy {
        font-size: 30px;
    }
}

@media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
    .content_top {
        height: auto;
        padding: 10px 20px;
    }
    .landing-logo {
        width: 72px;
        height: 72px;
    }

    .landing-brand-copy {
        font-size: 28px;
    }
}
</style>
