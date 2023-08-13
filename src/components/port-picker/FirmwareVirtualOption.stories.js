import FirmwareVirtualOption from "./FirmwareVirtualOption";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
    title: "Firmware virtual option",
    component: FirmwareVirtualOption,
};

const Template = (_args, {argTypes}) => ({
    props: Object.keys(argTypes),
    components: { FirmwareVirtualOption },
    template: '<firmware-virtual-option v-bind="$props" />',
});

export const Primary = Template.bind({});
