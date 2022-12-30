import BatteryIcon from "./BatteryIcon.vue";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
  title: "Battery Icon",
  component: BatteryIcon,
};

// More on component templates: https://storybook.js.org/docs/vue/writing-stories/introduction#using-args
const Template = (_args, { argTypes }) => ({
  props: Object.keys(argTypes),
  components: { BatteryIcon },
  template: '<battery-icon v-bind="$props" />',
});

export const Primary = Template.bind({});
