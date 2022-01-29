<script>
export async function configureApp(app) {
  //
}
</script>

<script setup>
const { component } = defineProps({
  component: Object,
});
</script>

<template>
  <component :is="component" />
</template>
