import StatusBar from "./StatusBar.vue";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
  title: "Status Bar",
  component: StatusBar,
};

// More on component templates: https://storybook.js.org/docs/vue/writing-stories/introduction#using-args
const Template = (_args, { argTypes }) => ({
  props: Object.keys(argTypes),
  components: { StatusBar },
  template: '<status-bar v-bind="$props" />',
});

export const Primary = Template.bind({});
