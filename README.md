# hollaex-node-lib

Nodejs library for HollaEx Kit enabled exchanges.

**This library is specifically for end users and traders to connect to HollaEx Kit exchanges. It connects to [HollaEx Pro](https://pro.hollaex.com/trade/xht-usdt) by default.**

## Usage

```javascript
const hollaex = require('hollaex-node-lib');

const client = new hollaex();
```

You can pass custom `apiURL`, `wsURL` and `baseURL` of the HollaEx-Enabled exchange to connect to. `apiURL` is `https://api.hollaex.com` for HollaEx Pro and for your custom exchange it would be something like `https://myexchange.com/api`.
`wsURL` is the websocket URL for the socket connection and you should pass your stream URL. For HollaEx Pro it is `wss://api.hollaex.com/stream` and for your exchange it would be something like `wss://myexchange.com/stream`. `baseURL` is not required and it is set by default to `/v2` unless you need to connect to an older version of HollaEx.

You can also pass your `apiKey` and `apiSecret` generated from the HollaEx-Enabled exchange to use private requests that require authentication. For public endpoints `apiKey` and `apiSecret` are not required.

```javascript
const client = new hollaex({
	apiURL: '<EXCHANGE_API_URL>',
	wsURL: '<EXCHANGE_WS_URL>',
	apiKey: '<MY_API_KEY>',
	apiSecret: '<MY_API_SECRET>'
});
```

You can also pass the field `apiExpiresAfter` which is the length of time in seconds each request is valid for. The default value is `60`.

### Example:

```javascript
const client = new hollaex({
	apiURL: '<EXCHANGE_API_URL>',
	wsURL: '<EXCHANGE_API_URL>',
	apiKey: '<MY_API_KEY>',
	apiSecret: '<MY_API_SECRET>'
});

client
	.getTicker('xht-usdt')
	.then((res) => {
		console.log('The volume is: ', res.volume);
	})
	.catch((err) => {
		console.log(err);
	});

client
	.getTrades({ symbol: 'xht-usdt' })
	.then((res) => {
		console.log('Public trades: ', res);
	})
	.catch((err) => {
		console.log(err);
	});
```

### Available functions:

| Command | Parameters | Description |
| - | - | - |
| `getKit` | | Get exchange information e.g. name, valid languages, description, etc. |
| `getConstants` | | Tick size, min price, max price, min size and max size of each symbol pair and coin |
| `getTicker` | <ul><li>**symbol**: HollaEx trading symbol e.g. `xht-usdt`</li></ul> | Last, high, low, open and close price and volume within the last 24 hours |
| `getTickers` | | Last, high, low, open and close price and volume within the last 24 hours for all symbols |
| `getOrderbook` | <ul><li>**symbol**: HollaEx trading symbol e.g. `xht-usdt`</li></ul> | Orderbook containing list of bids and asks |
| `getOrderbooks` | | Orderbook containing list of bids and asks for all symbols |
| `getTrades` | <ul><li>**opts**: Object with additional params</li><li>**opts.symbol**: (_optional_) HollaEx trading symbol e.g. `xht-usdt`</li></ul> | List of last trades |
| `getUser` | | User's personal information |
| `getBalance` | | User's wallet balance |
| `getDeposits` | <ul><li>**opts**: Object with additional params</li><li>**opts.currency**: (_optional_) Filter data set by asset</li><li>**opts.status**: (_optional_) Filter data set `status`</li><li>**opts.dismissed**: (_optional_) Filter data set `dismissed`</li><li>**opts.rejected**: (_optional_) Filter data set `rejected`</li><li>**opts.processing**: (_optional_) Filter data set `processing`</li><li>**opts.waiting**: (_optional_) Filter data set `waiting`</li><li>**opts.limit**: (_optional_, _default_=`50`, _max_=`50`) Number of items to get</li><li>**opts.page**: (_optional_, _default_=`1`) Page number of data</li><li>**opts.orderBy**: (_optional_) Field to order data by</li><li>**opts.order**: (_optional_, _enum_=[`asc`, `desc`]) Specify ascending or descending order</li><li>**opts.startDate**: (_optional_, _format_=`ISO8601`) Start date of data set</li><li>**opts.endDate**: (_optional_,  _format_=`ISO8601`) End date of data set</li><li>**opts.transactionId**: (_optional_) Filter data set by TXID</li><li>**opts.address**: (_optional_) Filter data set by address</li></ul> | User's list of all deposits |
| `getWithdrawals` | <ul><li>**opts**: Object with additional params</li><li>**opts.currency**: (_optional_) Filter data set by asset</li><li>**opts.status**: (_optional_) Filter data set `status`</li><li>**opts.dismissed**: (_optional_) Filter data set `dismissed`</li><li>**opts.rejected**: (_optional_) Filter data set `rejected`</li><li>**opts.processing**: (_optional_) Filter data set `processing`</li><li>**opts.waiting**: (_optional_) Filter data set `waiting`</li><li>**opts.limit**: (_optional_, _default_=`50`, _max_=`50`) Number of items to get</li><li>**opts.page**: (_optional_, _default_=`1`) Page number of data</li><li>**opts.orderBy**: (_optional_) Field to order data by</li><li>**opts.order**: (_optional_, _enum_=[`asc`, `desc`]) Specify ascending or descending order</li><li>**opts.startDate**: (_optional_, _format_=`ISO8601`) Start date of data set</li><li>**opts.endDate**: (_optional_,  _format_=`ISO8601`) End date of data set</li><li>**opts.transactionId**: (_optional_) Filter data set by TXID</li><li>**opts.address**: (_optional_) Filter data set by address</li></ul> | User's list of all withdrawals |
| `makeWithdrawal` | <ul><li>**currency**: Currency code e.g. `xht`</li><li>**amount**: Withdrawal amount</li><li>**address**: Address to withdrawal to</li><li>**opts**: Object with additional params</li><li>**opts.network**: (_required if asset has multiple networks_) Blockchain network to create address for e.g. `trx`</li></ul> | Create a new withdrawal request |
| `getUserTrades` | <ul><li>**opts**: Object with additional params</li><li>**opts.symbol**: (_optional_) HollaEx trading symbol e.g. `xht-usdt`</li><li>**opts.limit**: (_optional_, _default_=`50`, _max_=`50`) Number of items to get</li><li>**opts.page**: (_optional_, _default_=`1`) Page number of data</li><li>**opts.orderBy**: (_optional_) Field to order data by</li><li>**opts.order**: (_optional_, _enum_=[`asc`, `desc`]) Specify ascending or descending order</li><li>**opts.startDate**: (_optional_, _format_=`ISO8601`) Start date of data set</li><li>**opts.endDate**: (_optional_,  _format_=`ISO8601`) End date of data set</li></ul> | User's list of all trades |
| `getOrder` | <ul><li>**orderId**: HollaEx Network Order ID</li></ul> | Get specific information about a certain order |
| `getOrders` | <ul><li>**opts**: Object with additional params</li><li>**opts.symbol**: (_optional_) HollaEx trading symbol e.g. `xht-usdt`</li><li>**opts.side**: (_optional_, _enum_=[`buy`, `sell`]) Order side</li><li>**opts.status**: (_optional_) Filter data set `status`</li><li>**opts.limit**: (_optional_, _default_=`50`, _max_=`50`) Number of items to get</li><li>**opts.page**: (_optional_, _default_=`1`) Page number of data</li><li>**opts.orderBy**: (_optional_) Field to order data by</li><li>**opts.order**: (_optional_, _enum_=[`asc`, `desc`])</li><li>**opts.startDate**: (_optional_, _format_=`ISO8601`) Start date of data set</li><li>**opts.endDate**: (_optional_,  _format_=`ISO8601`) End date of data set</li></ul> | Get the list of all user orders. It can be filter by passing the symbol |
| `createOrder` | <ul><li>**symbol**: HollaEx trading symbol e.g. `xht-usdt`</li><li>**side** (_enum_=[`buy`, `sell`]): Order side</li><li>**size**: Size of order to place</li><li>**type**: (_enum_=[`market`, `limit`] Order type</li><li>**price**: (_required if limit order type_) Order price</li><li>**opts**: Object with additional params</li><li>**opts.stop**: (_optional_) Stop price for order</li><li>**opts.meta**: (_optional_) Object with additional meta configurations</li><li>**opts.meta.post_only**: (_optional_, _default_=`false`) Make post only order </li><li>**opts.meta.note**: (_optional_) Custom note for order</li></ul> | Create a new order |
| `cancelOrder` | <ul><li>**orderId**: HollaEx Network order ID</li></ul> | Cancel a specific order with its ID |
| `cancelAllOrders` | <ul><li>**symbol**: HollaEx trading symbol e.g. `xht-usdt`</li></ul> | Cancel all the active orders of a user, filtered by currency pair symbol |

### Available admin functions:

| Command | Parameters | Description |
| - | - | - |
| `getExchangeInfo` |  | Get admin exchange information
| `getExchangeDeposits` | <ul><li>**opts.userId**: The identifier of the user to filter by</li><li>**opts.currency**: The currency to filter by, pass undefined to receive data on all currencies</li><li>**opts.limit**: Amount of deposits per page. Maximum: 50. Default: 50</li><li>**opts.page**: Page of deposit data. Default: 1</li><li>**opts.orderBy**: The field to order data by e.g. amount, id.</li><li>**opts.order**: Ascending (asc) or descending (desc).</li><li>**opts.startDate**: Start date of query in ISO8601 format.</li><li>**opts.endDate**: End date of query in ISO8601 format.</li><li>**opts.status**: Confirmed status of the deposits to get. Leave blank to get all confirmed and unconfirmed deposits</li><li>**opts.dismissed**: Dismissed status of the deposits to get. Leave blank to get all dismissed and undismissed </li>deposits<li>**opts.rejected**: Rejected status of the deposits to get. Leave blank to get all rejected and unrejected deposits</li><li>**opts.processing**: Processing status of the deposits to get. Leave blank to get all processing and unprocessing deposits </li><li>**opts.waiting**: Waiting status of the deposits to get. Leave blank to get all waiting and unwaiting deposits</li><li>**opts.transactionId**: Deposits with specific transaction ID.</li><li>**opts.address**: Deposits with specific address.</li><li>**opts.format**: Custom format of data set. Enum: ['all', 'csv']</li></ul> | Retrieve list of the user's deposits by admin |
| `getExchangeWithdrawals` | <ul><li>**opts.userId**: The identifier of the user to filter by</li><li>**opts.currency**: The currency to filter by, pass undefined to receive data on all currencies</li><li>**opts.status**: Confirmed status of the withdrawals to get. Leave blank to get all confirmed and unconfirmed withdrawals</li><li>**opts.dismissed**: Dismissed status of the withdrawals to get. Leave blank to get all dismissed and undismissed withdrawals</li><li>**opts.rejected**: Rejected status of the withdrawals to get. Leave blank to get all rejected and unrejected withdrawals</li><li>**opts.processing**: Processing status of the withdrawals to get. Leave blank to get all processing and unprocessing withdrawals</li><li>**opts.waiting**: Waiting status of the withdrawals to get. Leave blank to get all waiting and unwaiting withdrawals</li><li>**opts.limit**: Amount of withdrawals per page. Maximum: 50. Default: 50</li><li>**opts.page**: Page of withdrawal data. Default: 1</li><li>**opts.orderBy**: The field to order data by e.g. amount, id.</li><li>**opts.order**: Ascending (asc) or descending (desc).</li><li>**opts.startDate**: Start date of query in ISO8601 format.</li><li>**opts.endDate**: End date of query in ISO8601 format.</li><li>**opts.transactionId**: Withdrawals with specific transaction ID.</li><li>**opts.address**: Withdrawals with specific address.</li><li>**opts.format**: Custom format of data set. Enum: ['all', 'csv']</li></ul> | Retrieve list of the user's withdrawals by admin |
| `getExchangeBalance` | | Retrieve admin's wallet balance |
| `transferExchangeAsset` | <ul><li>**senderId**: The identifier of the sender</li><li>**receiverId**: The identifier of the receiver</li><li>**currency**: The currency to specify</li><li>**amount**: The amount to specify</li><li>**opts.description**: The description field</li><li>**opts.email**: The email field</li></ul> | Transfer exchange asset by admin |
| `createExchangeDeposit` | <ul><li>**userId**: The identifier of the user</li><li>**currency**: The currency to specify</li><li>**amount**: The amount to specify</li><li>**opts.transactionId**: deposit with specific transaction ID.</li><li>**opts.status**: The status field to confirm the deposit</li><li>**opts.email**: The email field</li><li>**opts.fee**: The fee to specify</li></ul> | Create exchange deposit by admin |
| `updateExchangeDeposit` | <ul><li>**transactionId**: Deposits with specific transaction ID.</li><li>**opts.updatedTransactionId**: Deposits with updated transaction id</li><li>**opts.updatedAddress**: Deposits with updated address</li><li>**opts.status**: Confirmed status of the deposits to set. </li><li>**opts.dismissed**: Dismissed status of the deposits to set.</li><li>**opts.rejected**: Rejected status of the deposits to set. </li><li>**opts.processing**: Processing status of the deposits to set. </li><li>**opts.waiting**: Waiting status of the deposits to set.</li><li>**opts.email**: Email</li></ul> | Update exchange deposit by admin |
| `createExchangeWithdrawal` | <ul><li>**userId**: The identifier of the user</li><li>**currency**: The currency to specify</li><li>**amount**: The amount to specify</li><li>**opts.transactionId**: Withdrawal with specific transaction ID.</li><li>**opts.status**: The status field to confirm the withdrawal</li><li>**opts.email**: The email field</li><li>**opts.fee**: The fee to specify</li></ul> | Create exchange withdrawal by admin |
| `updateExchangeWithdrawal` | <ul><li>**transactionId**: Withdrawals with specific transaction ID.</li><li>**opts.updatedTransactionId**: Withdrawals with updated transaction id</li><li>**opts.updatedAddress**: Withdrawals with updated address</li><li>**opts.status**: Confirmed status of the withdrawals to set. </li><li>**opts.dismissed**: Dismissed status of the withdrawals to set.</li><li>**opts.rejected**: Rejected status of the withdrawals to set. </li><li>**opts.processing**: Processing status of the withdrawals to set.</li><li>**opts.waiting**: Waiting status of the withdrawals to set.</li><li>**opts.email**: Email</li></ul> | Update Exchange Withdrawal |
| `checkExchangeDepositStatus` | <ul><li>**userId**: The identifier of the user</li><li>**currency**: The currency to filter by, pass undefined to receive data on all currencies</li><li>**transactionId**: Deposits with specific transaction ID.</li><li>**address**: Deposits with specific address.</li><li>**network**: The network info</li><li>**opts.isTestnet**: The info on whether it's a testnet or not</li></ul> | Check exchange deposit status |
| `settleExchangeFees` | <ul><li>**opts.userId**: The identifier of the user</li></ul> | Set exchange fees by admin |
| `getExchangeTrades` | <ul><li>**opts.userId**: The identifier of the user</li><li>**opts.side**: The order side (buy or side)</li><li>**opts.limit**: Amount of trades per page. Maximum: 50. Default: 50</li><li>**opts.page**: Page of trades data. Default: 1</li><li>**opts.symbol**: The symbol-pair to filter by, pass undefined to receive data on all currencies</li><li>**opts.orderBy**: The field to trade data by e.g. amount, id.</li><li>**opts.order**: Ascending (asc) or descending (desc).</li><li>**opts.startDate**: Start date of query in ISO8601 format.</li><li>**opts.endDate**: End date of query in ISO8601 format.</li><li>**opts.format**: Custom format of data set. Enum: ['all', 'csv']</li></ul> | Retrieve user's trades by admin |
| `getExchangeOrders` | <ul><li>**opts.userId**: The identifier of the user</li><li>**opts.side**: The order side (buy or side)</li><li>**opts.status**: The order's status e.g open, filled, canceled etc</li><li>**opts.open**: The info on whether the order is active or not </li><li>**opts.side**: The order side (buy or side)</li><li>**opts.limit**: Amount of orders per page. Maximum: 50. Default: 50</li><li>**opts.page**: Page of order data. Default: 1</li><li>**opts.symbol**: The symbol-pair to filter by, pass undefined to receive data on all currencies</li><li>**opts.orderBy:** The field to order data by e.g. amount, id.</li><li>**opts.order:** Ascending (asc) or descending (desc).</li><li>**opts.startDate:** Start date of query in ISO8601 format.</li><li>**opts.endDate:** End date of query in ISO8601 format.</li></ul> | Retrieve user's orders by admin |
| `cancelExchangeUserOrder` | <ul><li>**userId**: The identifier of the user</li><li>**orderId**: The identifier of the order</li></ul> | Cancel user's order by order id |
| `getExchangeUsers` | <ul><li>**opts**: Optional parameters</li><li>**opts.userId**: The identifier of the user to filter by</li><li>**opts.search**: The search text to filter by, pass undefined to receive data on all fields</li><li>**opts.pending**: The pending field to filter by, pass undefined to receive all data</li><li>**opts.pendingType**: Th pending type info to filter by, pass undefined to receive data</li><li>**opts.limit**: Amount of users per page. Maximum: 50. Default: 50</li><li>**opts.page**: Page of user data. Default: 1</li><li>**opts.orderBy**: The field to order data by e.g. amount, id.</li><li>**opts.order**: Ascending (asc) or descending (desc).</li><li>**opts.startDate**: Start date of query in ISO8601 format.</li><li>**opts.endDate**: End date of query in ISO8601 format.</li><li>**opts.format**: Custom format of data set. Enum: ['all', 'csv']</li></ul> | Retrieve list of the user info by admin |
| `createExchangeUser` | <ul><li>**email**: The mail address for the user</li<li>**password**: The password for the user</li></ul> | Create exchange user |
| `updateExchangeUser` | <ul><li>**userId**: The identifier of the user to filter by</li><li>**opts.meta**: The field to update user meta info</li><li>**opts.overwrite**: the field to set overwrite option along with meta object</li><li>**opts.role**: The field to update user role ('admin', 'supervisor', 'support', 'kyc', 'communicator', 'user')</li><li>**opts.note**: The field to update user note </li><li>**opts.verification_level**: The field to set user's verification level</li></ul> | Update exchange user |
| `createExchangeUserWallet` | <ul><li>**userId**: The identifier of the user</li><li>**crypto**: The coin for the wallet e.g btc, eth</li><li>**opts.network**: The network info </li></ul> | Create wallet for exchange user |
| `getExchangeUserWallet` | <ul><li>**opts.userId**: The identifier of the user to filter by</li><li>**opts.limit**: Amount of users per page. Maximum: 50. Default: 50</li><li>**opts.currency**: The currency to filter by</li><li>**opts.page**: Page of user data. Default: 1</li><li>**opts.orderBy**: The field to order data by e.g. amount, id.</li><li>**opts.order**: Ascending (asc) or descending (desc).</li><li>**opts.startDate**: Start date of query in ISO8601 format.</li><li>**opts.endDate**: End date of query in ISO8601 format.</li><li>**opts.address**: Address of crypto</li><li>**opts.isValid**: Specify whether or not wallet is valid</li><li>**opts.network**: Crypto network of currency</li><li>**opts.format**: Custom format of data set. Enum: ['all', 'csv']</li></ul> | Retrieve users' wallets by admin |
| `getExchangeUserBalance` | <ul><li>**userId**: The identifier of the user</li></ul> | Retrieve user's login info by admin |
| `createExchangeUserBank` | <ul><li>**userId**: The identifier of the user</li><li>**bankAccount**: Array of objects with bank account info</li></ul> | Create bank account for user by admin |
| `getExchangeUserLogins` | <ul><li>**opts.userId**: The identifier of the user</li><li>**opts.limit**: Amount of logins per page. Maximum: 50. Default: 50</li><li>**opts.page**: Page of referral data. Default: 1</li><li>**opts.orderBy**: The field to order data by e.g. amount, id.</li><li>**opts.order**: Ascending (asc) or descending (desc).</li><li>**opts.startDate**: Start date of query in ISO8601 format.</li><li>**opts.endDate**: End date of query in ISO8601 format.</li></ul> | Retrieve user's login info by admin |
| `deactivateExchangeUser` | <ul><li>**userId**: The identifier of the user to deactivate their exchange account</li></ul> | Deactivate exchange user account by admin |
| `deactivateExchangeUserOtp` | <ul><li>**userId**: The identifier of the user to deactivate their otp</li></ul> | Deactivate user otp by admin |
| `getExchangeUserReferrals` | <ul><li>**userId**: The identifier of the user to filter by</li><li>**opts.limit**: Amount of referrals per page. Maximum: 50. Default: 50</li><li>**opts.page**: Page of referral data. Default: 1</li><li>**opts.orderBy**: The field to order data by e.g. amount, id.</li><li>**opts.order**: Ascending (asc) or descending (desc).</li><li>**opts.startDate**: Start date of query in ISO8601 format.</li><li>**opts.endDate**: End date of query in ISO8601 format.</li></ul> | Retrieve user's referrals info by admin |
| `getExchangeUserReferrer` | <ul><li>**userId**: The identifier of the user to filter by</li></ul> | Retrieve user's referer info by admin |
| `sendExchangeUserEmail` | <ul><li>**userId**:  The identifier of the user</li><li>**mailType**: The mail type for the email payload</li><li>**data**: The content of the mail</li></ul> | Send email to exchange user account by admin |
| `sendRawEmail` | <ul><li>**receivers**:  The array of emails to send mail</li><li>**html**: The stringified html content</li><li>**opts.title**:  The title of the mail</li><li>**opts.text**:  The text of the mail</li></ul> | Send email to users with custom html by admin |
| `getOraclePrice` | <ul><li>**assets**:  Assets to convert</li><li>**opts.quote**: Quote coin to convert to</li><li>**opts.amount**:  Amount to convert</li></ul> | Retrieve price conversion |
| `getExchangeUserBalances` | <ul><li>**opts.userId**:  The identifier of the user to filter by</li><li>**opts.currency**: The currency to filter by, pass undefined to receive data on all currencies</li><li>**opts.format**: Custom format of data set. Enum: ['all', 'csv']</li></ul> | Retrieve user's balances by admin |


### Websocket

#### Functions

You can connect and subscribe to different websocket channels for realtime updates.

To connect, use the `connect` function with the channels you want to subscribe to in an array as the parameter. The connection will reconnect on it's own unless you call `disconnect`.

```javascript
client.connect(['orderbook', 'trade']);
```

To disconnect the websocket, call `disconnect`.

```javascript
client.disconnect();
```

To subscribe to more channels after connection, use `subscribe`.

```javascript
client.subscribe(['order', 'wallet']);
```

To unsubscribe from channels after connection, use `unsubscribe`.

```javascript
client.unsubscribe(['orderbook']);
```

#### Channels

Here is the list of channels you can subscribe to:

- `orderbook` (Available publicly)
- `trade` (Available publicly)
- `order` (Only available with authentication. Receive order updates)
- `usertrade` (Only available with authentication. Receive user trades)
- `wallet` (Only available with authentication. Receive balance updates)
- `deposit` (Only available with authentication. Receive deposit notifications)
- `withdrawal` (Only available with authentication. Receive withdrawal notifications)
- `admin` (Only available with authentication for the exchange administrator. Receive exchange operations such as deposits and withdrawals of all users)


For public channels (`orderbook`, `trade`), you can subscribe to specific symbols as follows:
`orderbook:xht-usdt`, `trade:xht-usdt`. Not passing a symbol will subscribe to all symbols.

#### Events

After connecting to the websocket, you can listen for events coming from the server by using the `on` function for the `ws` property of the client.
The events available are default websocket events e.g. `message`, `open`, `close`, `error`, `unexpected-response`, etc.

```javascript
client.ws.on('message', (data) => {
	data = JSON.parse(data);
	console.log(data);
});
```

These are exapmles of data responses from the server.

- **orderbook**: Updates related to the user's private information are as follows:

	```json
	{
		"topic": "orderbook",
		"action": "partial",
		"symbol": "xht-usdt",
		"data": {
			"bids": [
				[0.1, 0.1],
				...
			],
			"asks": [
				[1, 1],
				...
			],
			"timestamp": "2020-12-15T06:45:27.766Z"
		},
		"time": 1608015328
	}
	```

- **trade**: Updates related to the user's private information are as follows:

	```json
	{
		"topic": "trade",
		"action": "partial",
		"symbol": "xht-usdt",
		"data": [
			{
				"size": 0.012,
				"price": 300,
				"side": "buy",
				"timestamp": "2020-12-15T07:25:28.887Z"
			},
			...
		],
		"time": 1608015328
	}
	```

- **wallet**: Updates related to the user's private information are as follows:

	```json
	{
		"topic": "wallet",
		"action": "partial",
		"user_id": 1,
		"data": {
			"usdt_balance": 1,
			"usdt_available": 1,
			"xht_balance": 1,
			"xht_available": 1,
			"xmr_balance": 1,
			"xmr_available": 1,
			"btc_balance": 1,
			"btc_available": 1,
			"eth_balance": 1,
			"eth_available": 1,
			...,
			"updated_at": "2020-12-15T08:41:24.048Z"
		},
		"time": 1608021684
	}
	```

- **order**: Websocket messages relating the the user's orders.
    - The `status` of the order can be `new`, `pfilled`, `filled`, and `canceled`.
    - The `action` of the data determines what caused it to happen. All three are explained below:

  - `partial`: All previous and current orders. Is the first order data received when connecting. Max: 50. Descending order.

	```json
	{
		"topic": "order",
		"action": "partial",
		"user_id": 1,
		"data": [
			{
				"id": "7d3d9545-b7e6-4e7f-84a0-a39efa4cb173",
				"side": "buy",
				"symbol": "xht-usdt",
				"type": "limit",
				"size": 0.1,
				"filled": 0,
				"price": 1,
				"stop": null,
				"status": "new",
				"fee": 0,
				"fee_coin": "xht",
				"meta": {},
				"fee_structure": {
					"maker": 0.1,
					"taker": 0.1
				},
				"created_at": "2020-11-30T07:45:43.819Z",
				"created_by": 1
			},
			...
		],
		"time": 1608022610
	}
	```

  - `insert`: When user's order is added. The status of the order can be either `new`, `pfilled`, or `filled`.

	```json
  	{
		"topic": "order",
		"action": "insert",
		"user_id": 1,
		"symbol": "xht-usdt",
		"data": [
			{
				"id": "7d3d9545-b7e6-4e7f-84a0-a39efa4cb173",
				"side": "buy",
				"symbol": "xht-usdt",
				"type": "limit",
				"size": 0.1,
				"filled": 0,
				"price": 1,
				"stop": null,
				"status": "new",
				"fee": 0,
				"fee_coin": "xht",
				"meta": {},
				"fee_structure": {
					"maker": 0.1,
					"taker": 0.1
				},
				"created_at": "2020-11-30T07:45:43.819Z",
				"updated_at": "2020-12-15T08:56:45.066Z",
				"created_by": 1
			},
			...
		],
		"time": 1608022610
	}
	```

  - `update`: When user's order status is updated. Status can be `pfilled`, `filled`, and `canceled`.

	```json
  	{
		"topic": "order",
		"action": "insert",
		"user_id": 1,
		"symbol": "xht-usdt",
		"data": [
			{
				"id": "7d3d9545-b7e6-4e7f-84a0-a39efa4cb173",
				"side": "buy",
				"symbol": "xht-usdt",
				"type": "limit",
				"size": 0.1,
				"filled": 0,
				"price": 1,
				"stop": null,
				"status": "new",
				"fee": 0,
				"fee_coin": "xht",
				"meta": {},
				"fee_structure": {
					"maker": 0.1,
					"taker": 0.1
				},
				"created_at": "2020-11-30T07:45:43.819Z",
				"updated_at": "2020-12-15T08:56:45.066Z",
				"created_by": 1
			},
			...
		],
		"time": 1608022610
	}
	```
- **deposit**: Updates related to the user's private information are as follows:

	```json
	{
		"topic": "deposit",
		"action": "insert",
		"user_id": 1,
		"data": {
			"amount": 1,
			"currency": "xht",
			"status": "COMPLETED",
			 "transaction_id": "123",
			...
		},
		"time": 1608021684
	}
	```
- **withdrawal**: Updates related to the user's private information are as follows:

	```json
	{
		"topic": "withdrawal",
		"action": "insert",
		"user_id": 1,
		"data": {
			"amount": 1,
			"currency": "xht",
			"status": "COMPLETED",
			 "transaction_id": "123",
			...
		},
		"time": 1608021684
	}
	```

## Example

You can run the example by going to example folder and running:

```bash
node example/hollaex.js
```

## Documentation

For adding additional functionalities simply go to index.js and add more features.
You can read more about api documentation at https://apidocs.hollaex.com
You should create your token on the platform in setting->api keys
