import DataFlash from "./DataFlash";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
    title: "Default flash",
    component: DataFlash,
};

// More on component templates: https://storybook.js.org/docs/vue/writing-stories/introduction#using-args
const Template = (_args, { argTypes }) => ({
    props: Object.keys(argTypes),
    components: { DataFlash },
    template: '<data-flash v-bind="$props" />',
});

export const Primary = Template.bind({});
