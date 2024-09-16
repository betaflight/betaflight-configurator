import OSDPreviewPanel from './OSDPreviewPanel.vue';

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
  title: 'OSD Preview Panel',
  component: OSDPreviewPanel,
};

// More on component templates: https://storybook.js.org/docs/vue/writing-stories/introduction#using-args
const Template = (_args, { argTypes }) => ({
  props: Object.keys(argTypes),
  components: { OSDPreviewPanel },
  template: '<OSDPreviewPanel v-bind="$props" />',
});

export const Primary = Template.bind({});
// More on args: https://storybook.js.org/docs/vue/writing-stories/args
Primary.args = {
  msg: '1.0.0',
};
