import BottomStatusIcons from "./BottomStatusIcons";

// More on default export: https://storybook.js.org/docs/vue/writing-stories/introduction#default-export
export default {
    title: "Bottom status icons",
    component: BottomStatusIcons,
};

// More on component templates: https://storybook.js.org/docs/vue/writing-stories/introduction#using-args
const Template = (_args, { argTypes }) => ({
    props: Object.keys(argTypes),
    components: { BottomStatusIcons },
    template: '<bottom-status-icons v-bind="$props" />',
});

export const Primary = Template.bind({});
