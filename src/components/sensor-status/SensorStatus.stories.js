import SensorStatus from "./SensorStatus";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
    title: "Sensor status",
    component: SensorStatus,
};

const Template = (_args, {argTypes}) => ({
    props: Object.keys(argTypes),
    components: { SensorStatus },
    template: '<sensor-status v-bind="$props" />',
});

export const Primary = Template.bind({});
