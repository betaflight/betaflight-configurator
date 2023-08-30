import PortsInput from "./PortsInput";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
    title: "Ports input",
    component: PortsInput,
};

const Template = (_args, {argTypes}) => ({
    props: Object.keys(argTypes),
    components: { PortsInput },
    template: '<ports-input v-bind="$props" />',
});

export const Primary = Template.bind({});
