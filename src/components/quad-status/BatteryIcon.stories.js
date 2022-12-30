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

export const OK = Template.bind({});
OK.args = {
  voltage: 16,
  vbatmincellvoltage: 3.7,
  vbatmaxcellvoltage: 4.2,
  vbatwarningcellvoltage: 3.8,
};
export const Warning = Template.bind({});
Warning.args = {
  ...OK.args,
  voltage: 15.1,
};
export const Empty = Template.bind({});
Empty.args = {
  ...OK.args,
  voltage: 14,
};
