<template>
    <BaseTab tab-name="am32_flasher">
        <div class="content_wrapper">
            <div class="tab_title">AM32 Flasher</div>
            <FlasherAm32Tab />
        </div>
    </BaseTab>
</template>

<script setup>
import BaseTab from "./BaseTab.vue";
import FlasherAm32Tab from "./firmware-flasher/FlasherAm32Tab.vue";
</script>
