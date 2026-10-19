/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import type { Meta, StoryObj } from "@storybook/vue3-vite";
import BatteryIcon from "./BatteryIcon.vue";

const meta = {
    title: "Battery Icon",
    component: BatteryIcon,
} satisfies Meta<typeof BatteryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OK: Story = {
    args: {
        voltage: 16,
        vbatmaxcellvoltage: 4.2,
        vbatwarningcellvoltage: 3.8,
    },
};
export const Warning: Story = {
    args: {
        ...OK.args,
        voltage: 15.1,
    },
};
export const Empty: Story = {
    args: {
        ...OK.args,
        voltage: 14,
    },
};
