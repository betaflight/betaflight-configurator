## Default Permission

Default permissions for the DFU plugin: enumerate DFU-capable USB devices,
request USB permission, open/close a device, claim/release its interface,
and perform control transfers.

#### This default permission set includes the following:

- `allow-list-devices`
- `allow-request-permission`
- `allow-open-device`
- `allow-claim-interface`
- `allow-release-interface`
- `allow-close-device`
- `allow-control-transfer-in`
- `allow-control-transfer-out`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`dfu:allow-claim-interface`

</td>
<td>

Enables the claim_interface command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:deny-claim-interface`

</td>
<td>

Denies the claim_interface command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:allow-close-device`

</td>
<td>

Enables the close_device command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:deny-close-device`

</td>
<td>

Denies the close_device command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:allow-control-transfer-in`

</td>
<td>

Enables the control_transfer_in command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:deny-control-transfer-in`

</td>
<td>

Denies the control_transfer_in command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:allow-control-transfer-out`

</td>
<td>

Enables the control_transfer_out command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:deny-control-transfer-out`

</td>
<td>

Denies the control_transfer_out command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:allow-list-devices`

</td>
<td>

Enables the list_devices command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:deny-list-devices`

</td>
<td>

Denies the list_devices command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:allow-open-device`

</td>
<td>

Enables the open_device command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:deny-open-device`

</td>
<td>

Denies the open_device command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:allow-release-interface`

</td>
<td>

Enables the release_interface command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:deny-release-interface`

</td>
<td>

Denies the release_interface command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:allow-request-permission`

</td>
<td>

Enables the request_permission command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`dfu:deny-request-permission`

</td>
<td>

Denies the request_permission command without any pre-configured scope.

</td>
</tr>
</table>
