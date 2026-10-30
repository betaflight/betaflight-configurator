<!--
This file is part of Betaflight.

Betaflight is free software. You can redistribute this software
and/or modify this software under the terms of the GNU General
Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later
version.

Betaflight is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

See the GNU General Public License for more details.

You should have received a copy of the GNU General Public
License along with this software.

If not, see <http://www.gnu.org/licenses/>.
-->
<template>
    <div class="log-window">
        <LogView />
    </div>
</template>

<script setup lang="ts">
import LogView from "./LogView.vue";
</script>

<style lang="less">
.log-window {
    position: fixed;
    inset: 0;
    padding: 0.75rem;
    font-size: 12px;
    background-color: var(--surface-100);
    color: var(--text);
    font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
}
</style>
