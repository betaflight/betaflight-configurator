import BatteryLegend from './BatteryLegend.vue';

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
  title: 'Battery Legend',
  component: BatteryLegend,
};

// More on component templates: https://storybook.js.org/docs/vue/writing-stories/introduction#using-args
const Template = (_args, { argTypes }) => ({
  props: Object.keys(argTypes),
  components: { BatteryLegend },
  template: '<battery-legend v-bind="$props" />',
});

export const Primary = Template.bind({});
