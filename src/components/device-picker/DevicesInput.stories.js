import DevicesInput from "./DevicesInput";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
    title: "Devices input",
    component: DevicesInput,
};

const Template = (_args, { argTypes }) => ({
    props: Object.keys(argTypes),
    components: { DevicesInput },
    template: '<devices-input v-bind="$props" />',
});

export const Primary = Template.bind({});
