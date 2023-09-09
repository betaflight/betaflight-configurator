import PortOverrideOption from "./PortOverrideOption";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
    title: "Port override option",
    component: PortOverrideOption,
};

const Template = (_args, {argTypes}) => ({
    props: Object.keys(argTypes),
    components: { PortOverrideOption },
    template: '<port-override-option v-bind="$props" />',
});

export const Primary = Template.bind({});
