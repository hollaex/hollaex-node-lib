'use strict';

const WebSocket = require('ws');
const moment = require('moment');
const { createRequest, createSignature, generateHeaders, isDatetime, sanitizeDate } = require('./utils');
const { setWsHeartbeat } = require('ws-heartbeat/client');
const { each, union, isNumber, isString, isPlainObject, isBoolean, isObject, isArray } = require('lodash');
class HollaExKit {
	constructor(
		opts = {
			apiURL: 'https://api.hollaex.com',
			baseURL: '/v2',
			apiKey: '',
			apiSecret: '',
			apiExpiresAfter: 60
		}
	) {
		this.apiUrl = opts.apiURL || 'https://api.hollaex.com';
		this.baseUrl = opts.baseURL || '/v2';
		this.apiKey = opts.apiKey;
		this.apiSecret = opts.apiSecret;
		this.apiExpiresAfter = opts.apiExpiresAfter || 60;
		this.headers = {
			'content-type': 'application/json',
			Accept: 'application/json',
			'api-key': opts.apiKey
		};
		this.ws = null;
		const [protocol, endpoint] = this.apiUrl.split('://');
		this.wsUrl = (
			opts.wsURL
				? opts.wsURL
				: protocol === 'https'
					? `wss://${endpoint}/stream`
					: `ws://${endpoint}/stream`
		);
		this.wsEvents = [];
		this.wsReconnect = true;
		this.wsReconnectInterval = 5000;
		this.wsEventListeners = null;
		this.wsConnected = () => this.ws && this.ws.readyState === WebSocket.OPEN;
	}

	/* Public Endpoints*/

	/**
	 * Get exchange information
	 * @return {object} A json object with the exchange information
	 */
	getKit() {
		return createRequest(
			'GET',
			`${this.apiUrl}${this.baseUrl}/kit`,
			this.headers
		);
	}

	/**
	 * Retrieve last, high, low, open and close price and volume within last 24 hours for a symbol
	 * @param {string} symbol - The currency pair symbol e.g. 'hex-usdt'
	 * @return {object} A JSON object with keys high(number), low(number), open(number), close(number), volume(number), last(number)
	 */
	getTicker(symbol = '') {
		return createRequest(
			'GET',
			`${this.apiUrl}${this.baseUrl}/ticker?symbol=${symbol}`,
			this.headers
		);
	}

	/**
	 * Retrieve last, high, low, open and close price and volume within last 24 hours for all symbols
	 * @return {object} A JSON object with symbols as keys which contain high(number), low(number), open(number), close(number), volume(number), last(number)
	 */
	getTickers() {
		return createRequest(
			'GET',
			`${this.apiUrl}${this.baseUrl}/tickers`,
			this.headers
		);
	}

	/**
	 * Retrieve orderbook containing lists of up to the last 20 bids and asks for a symbol
	 * @param {string} symbol - The currency pair symbol e.g. 'hex-usdt'
	 * @return {object} A JSON object with keys bids(array of active buy orders), asks(array of active sell orders), and timestamp(string)
	 */
	getOrderbook(symbol = '') {
		return createRequest(
			'GET',
			`${this.apiUrl}${this.baseUrl}/orderbook?symbol=${symbol}`,
			this.headers
		);
	}

	/**
	 * Retrieve orderbook containing lists of up to the last 20 bids and asks for all symbols
	 * @return {object} A JSON object with the symbol-pairs as keys where the values are objects with keys bids(array of active buy orders), asks(array of active sell orders), and timestamp(string)
	 */
	getOrderbooks() {
		return createRequest(
			'GET',
			`${this.apiUrl}${this.baseUrl}/orderbooks`,
			this.headers
		);
	}

	/**
	 * Retrieve list of up to the last 50 trades
	 * @param {object} opts - Optional parameters
	 * @param {string} opts.symbol - The currency pair symbol e.g. 'hex-usdt'
	 * @return {object} A JSON object with the symbol-pairs as keys where the values are arrays of objects with keys size(number), price(number), side(string), and timestamp(string)
	 */
	getTrades(opts = { symbol: null }) {
		let path = `${this.apiUrl}${this.baseUrl}/trades`;

		if (isString(opts.symbol)) {
			path += `?symbol=${opts.symbol}`;
		}

		return createRequest('GET', path, this.headers);
	}

	/**
	 * Retrieve tick size, min price, max price, min size, and max size of each symbol-pair
	 * @return {object} A JSON object with the keys pairs(information on each symbol-pair such as tick_size, min/max price, and min/max size) and currencies(array of all currencies involved in hollaEx)
	 */
	getConstants() {
		return createRequest(
			'GET',
			`${this.apiUrl}${this.baseUrl}/constants`,
			this.headers
		);
	}

	/* Private Endpoints*/

	/**
	 * Retrieve user's personal information
	 * @return {string} A JSON object showing user's information such as id, email, bank_account, crypto_wallet, balance, etc
	 */
	getUser() {
		const verb = 'GET';
		const path = `${this.baseUrl}/user`;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve user's wallet balance
	 * @return {object} A JSON object with the keys updated_at(string), usdt_balance(number), usdt_pending(number), usdt_available(number), hex_balance, hex_pending, hex_available, eth_balance, eth_pending, eth_available, bch_balance, bch_pending, bch_available
	 */
	getBalance() {
		const verb = 'GET';
		const path = `${this.baseUrl}/user/balance`;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve list of the user's deposits
	 * @param {object} opts - Optional parameters
	 * @param {string} opts.currency - The currency to filter by, pass undefined to receive data on all currencies
	 * @param {boolean} opts.status - Confirmed status of the deposits to get. Leave blank to get all confirmed and unconfirmed deposits
	 * @param {boolean} opts.dismissed - Dismissed status of the deposits to get. Leave blank to get all dismissed and undismissed deposits
	 * @param {boolean} opts.rejected - Rejected status of the deposits to get. Leave blank to get all rejected and unrejected deposits
	 * @param {boolean} opts.processing - Processing status of the deposits to get. Leave blank to get all processing and unprocessing deposits
	 * @param {boolean} opts.waiting - Waiting status of the deposits to get. Leave blank to get all waiting and unwaiting deposits
	 * @param {number} opts.limit - Amount of trades per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of trades data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @param {string} opts.transactionId - Deposits with specific transaction ID.
	 * @param {string} opts.address - Deposits with specific address.
	 * @return {object} A JSON object with the keys count(total number of user's deposits) and data(array of deposits as objects with keys id(number), type(string), amount(number), transaction_id(string), currency(string), created_at(string), status(boolean), fee(number), dismissed(boolean), rejected(boolean), description(string))
	 */
	getDeposits(
		opts = {
			currency: null,
			status: null,
			dismissed: null,
			rejected: null,
			processing: null,
			waiting: null,
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null,
			transactionId: null,
			address: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/user/deposits`;
		let params = '?';

		if (isString(opts.currency)) {
			params += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order)) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.address)) {
			params += `&address=${opts.address}`;
		}

		if (isString(opts.transactionId)) {
			params += `&transaction_id=${opts.transactionId}`;
		}

		if (isBoolean(opts.status)) {
			params += `&status=${opts.status}`;
		}

		if (isBoolean(opts.dismissed)) {
			params += `&dismissed=${opts.dismissed}`;
		}

		if (isBoolean(opts.rejected)) {
			params += `&rejected=${opts.rejected}`;
		}

		if (isBoolean(opts.processing)) {
			params += `&processing=${opts.processing}`;
		}

		if (isBoolean(opts.waiting)) {
			params += `&waiting=${opts.waiting}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/****** Withdrawals ******/
	/**
	 * Retrieve list of the user's withdrawals
	 * @param {object} opts - Optional parameters
	 * @param {string} opts.currency - The currency to filter by, pass undefined to receive data on all currencies
	 * @param {boolean} opts.status - Confirmed status of the withdrawals to get. Leave blank to get all confirmed and unconfirmed withdrawals
	 * @param {boolean} opts.dismissed - Dismissed status of the withdrawals to get. Leave blank to get all dismissed and undismissed withdrawals
	 * @param {boolean} opts.rejected - Rejected status of the withdrawals to get. Leave blank to get all rejected and unrejected withdrawals
	 * @param {boolean} opts.processing - Processing status of the withdrawals to get. Leave blank to get all processing and unprocessing withdrawals
	 * @param {boolean} opts.waiting - Waiting status of the withdrawals to get. Leave blank to get all waiting and unwaiting withdrawals
	 * @param {number} opts.limit - Amount of trades per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of trades data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @param {string} opts.transactionId - Withdrawals with specific transaction ID.
	 * @param {string} opts.address - Withdrawals with specific address.
	 * @return {object} A JSON object with the keys count(total number of user's withdrawals) and data(array of withdrawals as objects with keys id(number), type(string), amount(number), transaction_id(string), currency(string), created_at(string), status(boolean), fee(number), dismissed(boolean), rejected(boolean), description(string))
	 */
	getWithdrawals(
		opts = {
			currency: null,
			status: null,
			dismissed: null,
			rejected: null,
			processing: null,
			waiting: null,
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null,
			transactionId: null,
			address: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/user/withdrawals`;
		let params = '?';

		if (isString(opts.currency)) {
			params += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order)) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.address)) {
			params += `&address=${opts.address}`;
		}

		if (isString(opts.transactionId)) {
			params += `&transaction_id=${opts.transactionId}`;
		}

		if (isBoolean(opts.status)) {
			params += `&status=${opts.status}`;
		}

		if (isBoolean(opts.dismissed)) {
			params += `&dismissed=${opts.dismissed}`;
		}

		if (isBoolean(opts.rejected)) {
			params += `&rejected=${opts.rejected}`;
		}

		if (isBoolean(opts.processing)) {
			params += `&processing=${opts.processing}`;
		}

		if (isBoolean(opts.waiting)) {
			params += `&waiting=${opts.waiting}`;
		}
		if (params.length > 1) path += params;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Make a withdrawal
	 * @param {string} currency - The currency to withdrawal
	 * @param {number} amount - The amount of currency to withdrawal
	 * @param {string} address - The recipient's wallet address
	 * @param {object} opts - Optional parameters.
	 * @param {string} opts.network - Crypto network of currency being withdrawn.
	 * @return {object} A JSON object {message:"Success"}
	 */
	makeWithdrawal(currency, amount, address, opts = {
		network: null,
	}) {
		const verb = 'POST';
		const path = `${this.baseUrl}/user/withdrawal`;
		const data = {
			currency,
			amount,
			address
		};

		if (opts.network) {
			data.network = opts.network;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Retrieve list of the user's completed trades
	 * @param {object} opts - Optional parameters
	 * @param {string} opts.symbol - The symbol-pair to filter by, pass undefined to receive data on all currencies
	 * @param {number} opts.limit - Amount of trades per page
	 * @param {number} opts.page - Page of trades data
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id. Default: id
	 * @param {string} opts.order - Ascending (asc) or descending (desc). Default: desc
	 * @param {string} opts.startDate - Start date of query in ISO8601 format
	 * @param {string} opts.endDate - End date of query in ISO8601 format
	 * @param {string} opts.format - Custom format of data set. Enum: ['all', 'csv']
	 * @return {object} A JSON object with the keys count(total number of user's completed trades) and data(array of up to the user's last 50 completed trades as objects with keys side(string), symbol(string), size(number), price(number), timestamp(string), and fee(number))
	 */
	getUserTrades(
		opts = {
			symbol: null,
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/user/trades`;
		let params = '?';

		if (isString(opts.symbol)) {
			params += `&symbol=${opts.symbol}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order)) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.format) && ['csv', 'all'].includes(opts.format)) {
			params += `&format=${opts.format}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);

		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/****** Orders ******/
	/**
	 * Retrieve information of a user's specific order
	 * @param {string} orderId - The id of the desired order
	 * @return {object} The selected order as a JSON object with keys created_at(string), title(string), symbol(string), side(string), size(number), type(string), price(number), id(string), created_by(number), filled(number)
	 */
	getOrder(orderId) {
		const verb = 'GET';
		const path = `${this.baseUrl}/order?order_id=${orderId}`;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve information of all the user's active orders
	 * @param {object} opts - Optional parameters
	 * @param {string} opts.symbol - The currency pair symbol to filter by e.g. 'hex-usdt', leave empty to retrieve information of orders of all symbols
	 * @param {number} opts.limit - Amount of trades per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of trades data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @return {object} A JSON array of objects containing the user's active orders
	 */
	getOrders(
		opts = {
			symbol: null,
			side: null,
			status: null,
			open: null,
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/orders`;
		let params = '?';

		if (isString(opts.symbol)) {
			params += `&symbol=${opts.symbol}`;
		}

		if (isString(opts.side) && (opts.side.toLowerCase() === 'buy' || opts.side.toLowerCase() === 'sell')) {
			params += `&side=${opts.side}`;
		}

		if (isString(opts.status)) {
			params += `&status=${opts.status}`;
		}

		if (isBoolean(opts.open)) {
			params += `&open=${opts.open}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order)) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Create a new order
	 * @param {string} symbol - The currency pair symbol e.g. 'hex-usdt'
	 * @param {string} side - The side of the order e.g. 'buy', 'sell'
	 * @param {number} size - The amount of currency to order
	 * @param {string} type - The type of order to create e.g. 'market', 'limit'
	 * @param {number} price - The price at which to order (only required if type is 'limit')
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.stop - Stop order price
	 * @param {object} opts.meta - Additional meta parameters in an object
	 * @param {boolean} opts.meta.post_only - Whether or not the order should only be made if market maker.
	 * @param {string} opts.meta.note - Additional note to add to order data.
	 * @return {object} The new order as a JSON object with keys symbol(string), side(string), size(number), type(string), price(number), id(string), created_by(number), and filled(number)
	 */
	createOrder(
		symbol,
		side,
		size,
		type,
		price = 0,
		opts = {
			stop: null,
			meta: null
		}
	) {
		const verb = 'POST';
		const path = `${this.baseUrl}/order`;
		const data = { symbol, side, size, type, price };

		if (isPlainObject(opts.meta)) {
			data.meta = opts.meta;
		}

		if (isNumber(opts.stop)) {
			data.stop = opts.stop;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Cancel a user's specific order
	 * @param {string} orderId - The id of the order to be cancelled
	 * @return {object} The cancelled order as a JSON object with keys symbol(string), side(string), size(number), type(string), price(number), id(string), created_by(number), and filled(number)
	 */
	cancelOrder(orderId) {
		const verb = 'DELETE';
		const path = `${this.baseUrl}/order?order_id=${orderId}`;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Cancel all the active orders of a user, filtered by currency pair symbol
	 * @param {string} symbol - The currency pair symbol to filter by e.g. 'hex-usdt'
	 * @return {array} A JSON array of objects containing the cancelled orders
	 */
	cancelAllOrders(symbol) {
		if (!isString(symbol)) {
			throw new Error('You must provide a symbol to cancel all orders for');
		}

		const verb = 'DELETE';
		let path = `${this.baseUrl}/order/all?symbol=${symbol}`;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);

		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve price conversion
	 * @param {array} assets - Assets to convert
	 * @param {string} opts.quote - Quote coin to convert to
	 * @param {number} opts.amount - Amount to convert
	 * @return {object} A JSON object with conversion info
	 */
	getOraclePrice(
		assets,
		opts = {
			quote: null,
			amount: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/oracle/prices`;
		let params = '?';

		if (isArray(assets)) {
			params += `&assets=${assets}`;
		}

		if (isString(opts.quote)) {
			params += `&quote=${opts.quote}`;
		}

		if (isNumber(opts.amount)) {
			params += `&amount=${opts.amount}`;
		}
		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}


	/**
	 * Get trade history HOLCV for all pairs
	 * @param {array} assets - The list of assets to get the mini charts for
	 * @param {string} opts.from - Start Date
	 * @param {string} opts.to - End data
	 * @param {string} opts.quote - Quote asset to receive prices based on
	 * @return {object} A JSON object with trade history info
	 */
	getMiniCharts(
		assets,
		opts = {
			from: null,
			to: null,
			quote: null,
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/minicharts`;
		let params = '?';

		if (isArray(assets)) {
			params += `&assets=${opts.assets}`;
		}

		if (isString(opts.from)) {
			params += `&from=${opts.from}`;
		}

		if (isString(opts.to)) {
			params += `&to=${opts.to}`;
		}

		if (isString(opts.quote)) {
			params += `&quote=${opts.quote}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Get Quick Trade Quote
	 * @param {string} spending_currency -  Currency symbol of the spending currency
	 * @param {string} receiving_currency - Currency symbol of the receiving currency
	 * @param {string} opts.spending_amount - Spending amount
	 * @param {string} opts.receiving_amount - Receiving amount
	 */
	getQuickTradeQuote(
		spending_currency,
		receiving_currency,
		opts = {
			spending_amount: null,
			receiving_amount: null,
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/quick-trade`;
		let params = '?';

		if (isString(spending_currency)) {
			params += `&spending_currency=${spending_currency}`;
		}

		if (isString(receiving_currency)) {
			params += `&receiving_currency=${receiving_currency}`;
		}

		if (isString(opts.spending_amount)) {
			params += `&spending_amount=${opts.spending_amount}`;
		}

		if (isString(opts.receiving_amount)) {
			params += `&receiving_amount=${opts.receiving_amount}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Execute Order
	 * @param {string} token - Token
	 */
	executeOrder(
		token
	) {
		const verb = 'POST';
		let path = `${this.baseUrl}/order/execute`;
		const data = {
			token
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Get admin exchange information
	 * @return {object} A json object with the admin exchange information
	 */
	getExchangeInfo() {
		const verb = 'GET';
		const path = `${this.baseUrl}/admin/exchange`;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve list of the user's deposits by admin
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.userId - The identifier of the user to filter by
	 * @param {string} opts.currency - The currency to filter by, pass undefined to receive data on all currencies
	 * @param {number} opts.limit - Amount of deposits per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of deposit data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @param {boolean} opts.status - Confirmed status of the deposits to get. Leave blank to get all confirmed and unconfirmed deposits
	 * @param {boolean} opts.dismissed - Dismissed status of the deposits to get. Leave blank to get all dismissed and undismissed deposits
	 * @param {boolean} opts.rejected - Rejected status of the deposits to get. Leave blank to get all rejected and unrejected deposits
	 * @param {boolean} opts.processing - Processing status of the deposits to get. Leave blank to get all processing and unprocessing deposits
	 * @param {boolean} opts.waiting - Waiting status of the deposits to get. Leave blank to get all waiting and unwaiting deposits
	 * @param {string} opts.transactionId - Deposits with specific transaction ID.
	 * @param {string} opts.address - Deposits with specific address.
	 * @param {string} opts.format - Custom format of data set. Enum: ['all', 'csv']
	 * @return {object} A JSON object with the keys count(total number of user's deposits) and data(array of deposits as objects with keys id(number), type(string), amount(number), transaction_id(string), currency(string), created_at(string), status(boolean), fee(number), dismissed(boolean), rejected(boolean), description(string))
	 */
	getExchangeDeposits(
		opts = {
			userId: null,
			currency: null,
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null,
			status: null,
			dismissed: null,
			rejected: null,
			processing: null,
			waiting: null,
			transactionId: null,
			address: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/deposits`;
		let params = '?';

		if (isNumber(opts.userId)) {
			params += `&user_id=${opts.userId}`;
		}

		if (isString(opts.currency)) {
			params += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isBoolean(opts.status)) {
			params += `&status=${opts.status}`;
		}

		if (isBoolean(opts.dismissed)) {
			params += `&dismissed=${opts.dismissed}`;
		}

		if (isBoolean(opts.rejected)) {
			params += `&rejected=${opts.rejected}`;
		}

		if (isBoolean(opts.processing)) {
			params += `&processing=${opts.processing}`;
		}

		if (isBoolean(opts.waiting)) {
			params += `&waiting=${opts.waiting}`;
		}

		if (isString(opts.transactionId)) {
			params += `&transaction_id=${opts.transactionId}`;
		}

		if (isString(opts.address)) {
			params += `&address=${opts.address}`;
		}

		if (isString(opts.format) && ['csv', 'all'].includes(opts.format)) {
			params += `&format=${opts.format}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve list of the user's withdrawals by admin
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.userId - The identifier of the user to filter by
	 * @param {string} opts.currency - The currency to filter by, pass undefined to receive data on all currencies
	 * @param {boolean} opts.status - Confirmed status of the withdrawals to get. Leave blank to get all confirmed and unconfirmed withdrawals
	 * @param {boolean} opts.dismissed - Dismissed status of the withdrawals to get. Leave blank to get all dismissed and undismissed withdrawals
	 * @param {boolean} opts.rejected - Rejected status of the withdrawals to get. Leave blank to get all rejected and unrejected withdrawals
	 * @param {boolean} opts.processing - Processing status of the withdrawals to get. Leave blank to get all processing and unprocessing withdrawals
	 * @param {boolean} opts.waiting - Waiting status of the withdrawals to get. Leave blank to get all waiting and unwaiting withdrawals
	 * @param {number} opts.limit - Amount of withdrawals per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of withdrawal data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @param {string} opts.transactionId - Withdrawals with specific transaction ID.
	 * @param {string} opts.address - Withdrawals with specific address.
	 * @param {string} opts.format - Custom format of data set. Enum: ['all', 'csv']
	 * @return {object} A JSON object with the keys count(total number of user's withdrawals) and data(array of withdrawals as objects with keys id(number), type(string), amount(number), transaction_id(string), currency(string), created_at(string), status(boolean), fee(number), dismissed(boolean), rejected(boolean), description(string))
	 */
	getExchangeWithdrawals(
		opts = {
			currency: null,
			userId: null,
			transactionId: null,
			address: null,
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null,
			status: null,
			dismissed: null,
			rejected: null,
			processing: null,
			waiting: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/withdrawals`;
		let params = '?';

		if (isString(opts.currency)) {
			params += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.userId)) {
			params += `&user_id=${opts.userId}`;
		}

		if (isString(opts.transactionId)) {
			params += `&transaction_id=${opts.transactionId}`;
		}

		if (isString(opts.address)) {
			params += `&address=${opts.address}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isBoolean(opts.status)) {
			params += `&status=${opts.status}`;
		}

		if (isBoolean(opts.dismissed)) {
			params += `&dismissed=${opts.dismissed}`;
		}

		if (isBoolean(opts.rejected)) {
			params += `&rejected=${opts.rejected}`;
		}

		if (isBoolean(opts.processing)) {
			params += `&processing=${opts.processing}`;
		}

		if (isBoolean(opts.waiting)) {
			params += `&waiting=${opts.waiting}`;
		}

		if (isString(opts.format) && ['csv', 'all'].includes(opts.format)) {
			params += `&format=${opts.format}`;
		}

		if (params.length > 1) path += params;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve admin's wallet balance
	 * @return {object} A JSON object with the keys updated_at(string), usdt_balance(number), usdt_pending(number), usdt_available(number), hex_balance, hex_pending, hex_available, eth_balance, eth_pending, eth_available, bch_balance, bch_pending, bch_available
	 */
	getExchangeBalance() {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/balance`;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Transfer exchange asset by admin
	 * @param {number} senderId - The identifier of the sender
	 * @param {number} receiverId - The identifier of the receiver
	 * @param {string} currency - The currency to specify
	 * @param {number} amount - The amount to specify
	 * @param {string} opts.description - The description field
	 * @param {boolean} opts.email - The email field
	 * @return {object} A JSON object with transfer info
	 */
	transferExchangeAsset(
		senderId,
		receiverId,
		currency,
		amount,
		opts = {
			description: null,
			email: null
		}
	) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/transfer`;
		const data = {
			sender_id: senderId,
			receiver_id: receiverId,
			currency,
			amount
		};


		if (isString(opts.description)) {
			data.description = opts.description;
		}

		if (isBoolean(opts.email)) {
			data.email = opts.email;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Create exchange deposit by admin
	 * @param {number} userId - The identifier of the user
	 * @param {string} currency - The currency to specify
	 * @param {number} amount - The amount to specify
	 * @param {string} opts.transactionId - deposit with specific transaction ID.
	 * @param {boolean} opts.status - The status field to confirm the deposit
	 * @param {boolean} opts.email - The email field
	 * @param {number} opts.fee - The fee to specify
	 * @return {object} A JSON object with deposit info
	 */
	createExchangeDeposit(
		userId,
		currency,
		amount,
		opts = {
			transactionId: null,
			status: null,
			email: null,
			fee: null
		}
	) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/mint`;
		const data = {
			user_id: userId,
			currency,
			amount
		};


		if (isString(opts.transactionId)) {
			data.transaction_id = opts.transactionId;
		}

		if (isBoolean(opts.status)) {
			data.status = opts.status;
		}

		if (isBoolean(opts.email)) {
			data.email = opts.email;
		}

		if (isNumber(opts.fee)) {
			data.fee = opts.fee;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Update exchange deposit by admin
	 * @param {string} transactionId - Deposits with specific transaction ID.
	 * @param {boolean} opts.updatedTransactionId - Deposits with updated transaction id
	 * @param {boolean} opts.updatedAddress - Deposits with updated address
	 * @param {boolean} opts.status - Confirmed status of the deposits to set. 
	 * @param {boolean} opts.dismissed - Dismissed status of the deposits to set.
	 * @param {boolean} opts.rejected - Rejected status of the deposits to set. 
	 * @param {boolean} opts.processing - Processing status of the deposits to set. 
	 * @param {boolean} opts.waiting - Waiting status of the deposits to set.
	 * @param {boolean} opts.email - Email
	 * @return {object} A JSON object with deposit info
	 */
	updateExchangeDeposit(
		transactionId,
		opts = {
			updatedTransactionId: null,
			updatedAddress: null,
			status: null,
			rejected: null,
			dismissed: null,
			processing: null,
			waiting: null,
			email: null,
			description: null
		}
	) {
		const verb = 'PUT';
		let path = `${this.baseUrl}/admin/mint`;
		const data = {
			transaction_id: transactionId
		};

		if (isString(opts.updatedTransactionId)) {
			data.updated_transaction_id = opts.updatedTransactionId;
		}

		if (isString(opts.updatedAddress)) {
			data.updated_address = opts.updatedAddress;
		}

		if (isBoolean(opts.status)) {
			data.status = opts.status;
		}

		if (isBoolean(opts.rejected)) {
			data.rejected = opts.rejected;
		}

		if (isBoolean(opts.dismissed)) {
			data.dismissed = opts.dismissed;
		}

		if (isBoolean(opts.processing)) {
			data.processing = opts.processing;
		}

		if (isBoolean(opts.waiting)) {
			data.waiting = opts.waiting;
		}

		if (isBoolean(opts.email)) {
			data.email = opts.email;
		}

		if (isString(opts.description)) {
			data.description = opts.description;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });

	}

	/**
	 * Create exchange withdrawal by admin
	 * @param {number} userId - The identifier of the user
	 * @param {string} currency - The currency to specify
	 * @param {number} amount - The amount to specify
	 * @param {string} opts.transactionId - Withdrawal with specific transaction ID.
	 * @param {boolean} opts.status - The status field to confirm the withdrawal
	 * @param {boolean} opts.email - The email field
	 * @param {number} opts.fee - The fee to specify
	 * @return {object} A JSON object with withdrawal info
	 */
	createExchangeWithdrawal(
		userId,
		currency,
		amount,
		opts = {
			transactionId: null,
			status: null,
			email: null,
			fee: null
		}
	) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/burn`;
		const data = {
			user_id: userId,
			currency,
			amount
		};


		if (isString(opts.transactionId)) {
			data.transaction_id = opts.transactionId;
		}

		if (isBoolean(opts.status)) {
			data.status = opts.status;
		}

		if (isBoolean(opts.email)) {
			data.email = opts.email;
		}

		if (isNumber(opts.fee)) {
			data.fee = opts.fee;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Update Exchange Withdrawal
	 * @param {string} transactionId - Withdrawals with specific transaction ID.
	 * @param {boolean} opts.updatedTransactionId - Withdrawals with updated transaction id
	 * @param {boolean} opts.updatedAddress - Withdrawals with updated address
	 * @param {boolean} opts.status - Confirmed status of the withdrawals to set. 
	 * @param {boolean} opts.dismissed - Dismissed status of the withdrawals to set.
	 * @param {boolean} opts.rejected - Rejected status of the withdrawals to set. 
	 * @param {boolean} opts.processing - Processing status of the withdrawals to set.
	 * @param {boolean} opts.waiting - Waiting status of the withdrawals to set.
	 * @param {boolean} opts.email - Email
	 * @return {object} A JSON object with withdrawal info
	 */
	updateExchangeWithdrawal(
		transactionId,
		opts = {
			updatedTransactionId: null,
			updatedAddress: null,
			status: null,
			rejected: null,
			dismissed: null,
			processing: null,
			waiting: null,
			email: null,
			description: null
		}
	) {
		const verb = 'PUT';
		let path = `${this.baseUrl}/admin/burn`;
		const data = {
			transaction_id: transactionId
		};

		if (isString(opts.updatedTransactionId)) {
			data.updated_transaction_id = opts.updatedTransactionId;
		}

		if (isString(opts.updatedAddress)) {
			data.updated_address = opts.updatedAddress;
		}

		if (isBoolean(opts.status)) {
			data.status = opts.status;
		}

		if (isBoolean(opts.rejected)) {
			data.rejected = opts.rejected;
		}

		if (isBoolean(opts.dismissed)) {
			data.dismissed = opts.dismissed;
		}

		if (isBoolean(opts.processing)) {
			data.processing = opts.processing;
		}

		if (isBoolean(opts.waiting)) {
			data.waiting = opts.waiting;
		}

		if (isBoolean(opts.email)) {
			data.email = opts.email;
		}

		if (isString(opts.description)) {
			data.description = opts.description;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Check exchange deposit status
	 * @param {number} userId - The identifier of the user
	 * @param {string} currency - The currency to filter by, pass undefined to receive data on all currencies
	 * @param {string} transactionId - Deposits with specific transaction ID.
	 * @param {string} address - Deposits with specific address.
	 * @param {string} network - The network info
	 * @param {string} opts.isTestnet - The info on whether it's a testnet or not
	 * @return {object} A JSON object with deposit status info
	 */
	checkExchangeDepositStatus(
		currency,
		transactionId,
		address,
		network,
		opts = {
			isTestnet: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/check-transaction`;
		let params = '?';

		if (isString(currency)) {
			params += `&currency=${currency}`;
		}

		if (isString(transactionId)) {
			params += `&transaction_id=${transactionId}`;
		}

		if (isString(address)) {
			params += `&address=${address}`;
		}

		if (isString(network)) {
			params += `&network=${network}`;
		}

		if (isBoolean(opts.isTestnet)) {
			params += `&is_testnet=${opts.isTestnet}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Set exchange fees by admin
	 * @param {number} opts.userId - The identifier of the user
	 * @return {object} A JSON object with message
	 */
	settleExchangeFees(
		opts = {
			userId: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/fees/settle`;

		if (isNumber(opts.userId)) {
			path += `?user_id=${opts.userId}`;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve user's trades by admin
	 * @param {number} opts.userId - The identifier of the user
	 * @param {string} opts.side - The order side (buy or side)
	 * @param {number} opts.limit - Amount of trades per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of trades data. Default: 1
	 * @param {string} opts.symbol - The symbol-pair to filter by, pass undefined to receive data on all currencies
	 * @param {string} opts.orderBy - The field to trade data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @param {string} opts.format - Custom format of data set. Enum: ['all', 'csv']
	 * @return {object} A JSON object with trade info
	 */
	getExchangeTrades(
		opts = {
			userId: null,
			limit: null,
			page: null,
			symbol: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/trades`;
		let params = '?';

		if (isNumber(opts.userId)) {
			params += `&user_id=${opts.userId}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.symbol)) {
			params += `&symbol=${opts.symbol}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.format) && ['csv', 'all'].includes(opts.format)) {
			params += `&format=${opts.format}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve user's orders by admin
	 * @param {number} opts.userId - The identifier of the user
	 * @param {string} opts.side - The order side (buy or side)
	 * @param {string} opts.status - The order's status e.g open, filled, canceled etc
	 * @param {boolean} opts.open - The info on whether the order is active or not 
	 * @param {string} opts.side - The order side (buy or side)
	 * @param {number} opts.limit - Amount of orders per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of order data. Default: 1
	 * @param {string} opts.symbol - The symbol-pair to filter by, pass undefined to receive data on all currencies
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @return {object} A JSON object with order info
	 */
	getExchangeOrders(
		opts = {
			userId: null,
			side: null,
			status: null,
			open: null,
			limit: null,
			page: null,
			symbol: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/orders`;
		let params = '?';

		if (isNumber(opts.userId)) {
			params += `&user_id=${opts.userId}`;
		}

		if (isString(opts.side) && (opts.side === 'buy' || opts.side === 'sell')) {
			params += `&side=${opts.side}`;
		}

		if (isString(opts.status)) {
			params += `&status=${opts.status}`;
		}

		if (isBoolean(opts.open)) {
			params += `&open=${opts.open}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.symbol)) {
			params += `&symbol=${opts.symbol}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Cancel user's order by order id
	 * @param {number} userId - The identifier of the user
	 * @param {string} orderId - The identifier of the order
	 * @return {object} A JSON object with message
	 */
	cancelExchangeUserOrder(userId, orderId) {
		const verb = 'DELETE';
		let path = `${this.baseUrl}/admin/order`;
		let params = '?';

		if (isString(orderId)) {
			params += `&order_id=${orderId}`;
		}

		if (isNumber(userId)) {
			params += `&user_id=${userId}`;
		}

		if (params.length > 1) path += params;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve list of the user info by admin
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.id - The identifier of the user to filter by
	 * @param {number} opts.userId - The identifier of the user to filter by
	 * @param {string} opts.search - The search text to filter by, pass undefined to receive data on all fields
	 * @param {boolean} opts.pending - The pending field to filter by, pass undefined to receive all data
	 * @param {string} opts.pendingType - Th pending type info to filter by, pass undefined to receive data
	 * @param {string} opts.bank_key - bank query key to fetch specific bank
	 * @param {string} opts.bank_value -  bank query value to fetch specific bank
	 * @param {boolean} opts.activated -  bank activated query
	 * @param {number} opts.limit - Amount of users per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of user data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @param {string} opts.format - Custom format of data set. Enum: ['all', 'csv']
	 * @return {object} A JSON object with user data
	 */
	getExchangeUsers(
		opts = {
			id: null,
			userId: null,
			search: null,
			type: null,
			pending: null,
			pendingType: null,
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			bank_key: null,
			bank_value: null,
			activated: null,
			startDate: null,
			endDate: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/users`;
		let params = '?';

		if (isNumber(opts.id)) {
			params += `&id=${opts.id}`;
		}

		if (isNumber(opts.userId)) {
			params += `&id=${opts.userId}`;
		}

		if (isString(opts.search)) {
			params += `&search=${opts.search}`;
		}

		if (isString(opts.type)) {
			params += `&type=${opts.type}`;
		}

		if (isBoolean(opts.pending)) {
			params += `&pending=${opts.pending}`;
		}

		if (isString(opts.pendingType) && (opts.pendingType === 'id' || opts.pendingType === 'bank')) {
			params += `&pending_type=${opts.pendingType}`;
		}

		if (isString(opts.bank_key) && isString(opts.bank_value)) {
			params += `&bank_key=${opts.bank_key}&bank_value=${opts.bank_value}`;
		}
		if (isBoolean(opts.activated)) {
			params += `&activated=${opts.activated}`;
		}
		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.format) && ['csv', 'all'].includes(opts.format)) {
			params += `&format=${opts.format}`;
		}
		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Create exchange user
	 * @param {string} email - The mail address for the user
	 * @param {string} password - The password for the user
	 * @param {string} opts.referral - The referral code for the user
	 * @return {object} A JSON object with message
	 */
	createExchangeUser(email, password, opts = {
		referral: null
	}) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/user`;
		const data = {
			email,
			password
		};


		if (isString(opts.referral)) {
			data.referral = opts.referral;
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Update exchange user
	 * @param {number} userId - The identifier of the user to filter by
	 * @param {object} opts.meta - The field to update user meta info
	 * @param {boolean} opts.overwrite - the field to set overwrite option along with meta object
	 * @param {string} opts.role - The field to update user role ('admin', 'supervisor', 'support', 'kyc', 'communicator', 'user')
	 * @param {string} opts.note - The field to update user note 
	 * @param {number} opts.verification_level - The field to set user's verification level
	 * @return {object} A JSON object with user data
	 */
	updateExchangeUser(
		userId,
		opts = {
			role: null,
			meta: null,
			overwrite: null,
			discount: null,
			note: null,
			verification_level: null
		},

	) {
		if (isString(opts.role)
			&& ['admin', 'supervisor', 'support', 'kyc', 'communicator', 'user'].includes(opts.role)) {

			const verb = 'PUT';
			let path = `${this.baseUrl}/admin/user/role`;

			if (isNumber(userId)) {
				path += `?user_id=${userId}`;
			}
			const data = {
				role: opts.role
			};

			const headers = generateHeaders(
				this.headers,
				this.apiSecret,
				verb,
				path,
				this.apiExpiresAfter,
				data
			);
			return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
		}

		if (isObject(opts.meta)) {
			const verb = 'PUT';
			let path = `${this.baseUrl}/admin/user/meta`;

			if (isNumber(userId)) {
				path += `?user_id=${userId}`;
			}

			const data = {
				meta: opts.meta,
				...(isBoolean(opts.overwrite) && { overwrite: opts.overwrite }),
			};

			const headers = generateHeaders(
				this.headers,
				this.apiSecret,
				verb,
				path,
				this.apiExpiresAfter,
				data
			);
			return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
		}

		if (isNumber(opts.discount) && opts.discount <= 100 && opts.discount >= 0) {
			const verb = 'PUT';
			let path = `${this.baseUrl}/admin/user/discount`;

			if (isNumber(userId)) {
				path += `?user_id=${userId}`;
			}

			const data = {
				discount: opts.discount
			};

			const headers = generateHeaders(
				this.headers,
				this.apiSecret,
				verb,
				path,
				this.apiExpiresAfter,
				data
			);
			return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
		}

		if (isString(opts.note)) {
			const verb = 'PUT';
			let path = `${this.baseUrl}/admin/user/note`;

			if (isNumber(userId)) {
				path += `?user_id=${userId}`;
			}

			const data = {
				note: opts.note
			};

			const headers = generateHeaders(
				this.headers,
				this.apiSecret,
				verb,
				path,
				this.apiExpiresAfter,
				data
			);
			return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
		}

		if (isNumber(opts.verification_level)) {
			const verb = 'POST';
			let path = `${this.baseUrl}/admin/upgrade-user`;

			const data = {
				user_id: userId,
				verification_level: opts.verification_level
			};

			const headers = generateHeaders(
				this.headers,
				this.apiSecret,
				verb,
				path,
				this.apiExpiresAfter,
				data
			);
			return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
		}

	}

	/**
	 * Delete exchange user
	 * @param {number} user_id - The id for the user
	 * @return {object} A JSON object with message
	 */
	deleteExchangeUser(user_id) {
		const verb = 'DELETE';
		let path = `${this.baseUrl}/admin/user`;
		const data = {
			user_id
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}


	/**
	 * Create wallet for exchange user
	 * @param {number} userId - The identifier of the user
	 * @param {string} crypto - The coin for the wallet e.g btc, eth 
	 * @param {string} opts.network - The network info 
	 * @return {object} A JSON object with message
	 */
	createExchangeUserWallet(
		userId,
		crypto,
		opts = {
			network: null
		}
	) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/user/wallet`;
		const data = {
			user_id: userId,
			crypto
		};

		if (isString(opts.network)) {
			data.network = opts.network;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Retrieve users' wallets by admin
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.userId - The identifier of the user to filter by
	 * @param {number} opts.limit - Amount of users per page. Maximum: 50. Default: 50
	 * @param {string} opts.currency - The currency to filter by
	 * @param {number} opts.page - Page of user data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @param {string} opts.address - Address of crypto
	 * @param {boolean} opts.isValid - Specify whether or not wallet is valid
	 * @param {string} opts.network - Crypto network of currency
	 * @param {string} opts.format - Custom format of data set. Enum: ['all', 'csv']
	 * @return {object} A JSON object with user data
	 * 
	 */
	getExchangeUserWallet(
		opts = {
			userId: null,
			limit: null,
			page: null,
			currency: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null,
			address: null,
			isValid: null,
			network: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/user/wallet`;
		let params = '?';

		if (isNumber(opts.userId)) {
			params += `&user_id=${opts.userId}`;
		}

		if (isString(opts.currency)) {
			params += `&currency=${opts.currency}`;
		}

		if (isString(opts.address)) {
			params += `&address=${opts.address}`;
		}

		if (isString(opts.network)) {
			params += `&network=${opts.network}`;
		}

		if (isBoolean(opts.isValid)) {
			params += `&is_valid=${opts.isValid}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.format) && ['csv', 'all'].includes(opts.format)) {
			params += `&format=${opts.format}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve user's login info by admin
	 * @param {number} userId - The identifier of the user
	 * @return {object} A JSON object with user balance
	 */
	getExchangeUserBalance(userId) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/user/balance?user_id=${userId}`;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Create bank account for user by admin
	 * @param {number} userId - The identifier of the user
	 * @param {object} bankAccount - Array of objects with bank account info
	 * @return {object} A JSON object with bank account info
	 */
	createExchangeUserBank(userId, bankAccount) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/user/bank`;

		if (isNumber(userId)) {
			path += `?id=${userId}`;
		}

		const data = {
			bank_account: bankAccount
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });

	}

	/**
	 * Retrieve user's login info by admin
	 * @param {number} opts.userId - The identifier of the user
	 * @param {number} opts.limit - Amount of logins per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of referral data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @return {object} A JSON object with login info
	 */
	getExchangeUserLogins(
		opts = {
			userId: null,
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/logins`;
		let params = '?';

		if (isNumber(opts.userId)) {
			params += `&user_id=${opts.userId}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.format) && ['csv', 'all'].includes(opts.format)) {
			params += `&format=${opts.format}`;
		}

		if (params.length > 1) path += params;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Deactivate exchange user account by admin
	 * @param {number} userId - The identifier of the user to deactivate their exchange account
	 * @return {object} A JSON object with message
	 */
	deactivateExchangeUser(userId) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/user/activate`;
		const data = {
			user_id: userId,
			activated: false
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Deactivate user otp by admin
	 * @param {number} userId - The identifier of the user to deactivate their otp
	 * @return {object} A JSON object with message
	 */
	deactivateExchangeUserOtp(userId) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/deactivate-otp`;
		const data = {
			user_id: userId
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Retrieve user's referrals info by admin
	 * @param {number} userId - The identifier of the user to filter by
	 * @param {number} opts.limit - Amount of referrals per page. Maximum: 50. Default: 50
	 * @param {number} opts.page - Page of referral data. Default: 1
	 * @param {string} opts.orderBy - The field to order data by e.g. amount, id.
	 * @param {string} opts.order - Ascending (asc) or descending (desc).
	 * @param {string} opts.startDate - Start date of query in ISO8601 format.
	 * @param {string} opts.endDate - End date of query in ISO8601 format.
	 * @return {object} A JSON object with referral info
	 */
	getExchangeUserReferrals(
		userId = null,
		opts = {
			limit: null,
			page: null,
			orderBy: null,
			order: null,
			startDate: null,
			endDate: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/user/affiliation`;
		let params = '?';

		if (isNumber(userId)) {
			params += `&user_id=${userId}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			params += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			params += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			params += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (params.length > 1) path += params;


		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Retrieve user's referer info by admin
	 * @param {number} userId - The identifier of the user to filter by
	 * @return {object} A JSON object with referrer info
	 */
	getExchangeUserReferrer(userId) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/user/referer?user_id=${userId}`;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Send email to exchange user account by admin
	 * @param {number} userId - The identifier of the user
	 * @param {string} mailType - The mail type for the email payload
	 * @param {object} data - The content of the mail
	 * @return {object} A JSON object with message
	 */
	sendExchangeUserEmail(userId, mailType, content) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/send-email`;
		const data = {
			user_id: userId,
			mail_type: mailType,
			data: content
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Send email to users with custom html by admin
	 * @param {array} receivers - The array of emails to send mail
	 * @param {string} html - The stringified html content
	 * @param {string} opts.title - The title of the mail
	 * @param {string} opts.text - The text of the mail
	 * @return {object} A JSON object with message
	 */
	sendRawEmail(receivers, html, opts = {
		title: null,
		text: null
	}) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/send-email/raw`;
		const data = {
			receivers,
			html,
		};

		if (isString(opts.title)) {
			data.title = opts.title;
		}

		if (isString(opts.text)) {
			data.text = opts.text;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Retrieve user's balances by admin
	 * @param {number} opts.userId - The identifier of the user to filter by
	 * @param {number} opts.currency - The currency to filter by, pass undefined to receive data on all currencies
	 * @param {string} opts.format - Custom format of data set. Enum: ['all', 'csv']
	 * @return {object} A JSON object with referral info
	 */
	getExchangeUserBalances(
		opts = {
			userId: null,
			currency: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/balances?`;


		if (isNumber(opts.userId)) {
			path += `&user_id=${opts.userId}`;
		}

		if (isString(opts.currency)) {
			path += `&currency=${opts.currency}`;
		}

		if (isString(opts.format) && ['csv', 'all'].includes(opts.format)) {
			path += `&format=${opts.format}`;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Create order on behalf of user
	 * @param {number} user_id - User id for the order
	 * @param {string} symbol - Currency symbol of the order e.g. xht-usdt
	 * @param {number} size - Size of the order
	 * @param {number} price - Order Price
	 * @param {string} side - Order Side, buy or sell
	 * @param {string} type - Order Type, limit or market
	 */
	createOrderByAdmin(
		user_id,
		symbol,
		size,
		price,
		side,
		type
	) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/order`;

		const data = {
			user_id,
			size,
			side,
			type,
			price,
			symbol
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Create trade on behalf of users
	 * @param {number} maker_id - User id for the maker
	 * @param {number} taker_id - User id for the taker
	 * @param {number} maker_fee - fee in percentage for the maker
	 * @param {number} taker_fee - fee in percentage for the taker
	 * @param {string} symbol - Currency symbol of the order e.g. xht-usdt
	 * @param {number} size - Size of the order
	 * @param {number} price - Order Price
	 * @param {string} side - Order Side, buy or sell
	 */
	createTradeByAdmin(
		maker_id,
		taker_id,
		maker_fee,
		taker_fee,
		symbol,
		size,
		price,
		side,
	) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/trade`;

		const data = {
			maker_id,
			taker_id,
			maker_fee,
			taker_fee,
			symbol,
			size,
			price,
			side,
		};

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}
	/**
	 * Create withdrawal on behalf of users
	 * @param {number} user_id - User id for the withdrawal process
	 * @param {string} address - Specific address for the withdrawal
	 * @param {number} amount - Size of the withdrawal
	 * @param {string} currency - Currency symbol of the withdrawal
	 * @param {string} opts.network - Blockchain network
	 */
	createWithdrawalByAdmin(
		user_id,
		address,
		amount,
		currency,
		opts = {
			network: null
		}
	) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/withdrawal`;

		const data = {
			user_id,
			address,
			amount,
			currency
		};

		if (isString(opts.network)) {
			data.network = opts.network;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}


	/**
	 * Get exchange stakes for admin
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.limit - Number of elements to return. Default: 50. Maximum: 100
	 * @param {number} opts.page - Page of data to retrieve
	 * @param {string} opts.order_by - Field to order data
	 * @param {string} opts.order - Direction to order (asc/desc)
	 * @param {string} opts.start_date - Starting date of queried data in ISO8601 format
	 * @param {string} opts.end_date - Ending date of queried data in ISO8601 format
	 * @param {string} opts.format - Specify data format (csv/all)
	 * @return {object} A JSON object with stakes data
	 */
	getExchangeStakesByAdmin(
		opts = {
			limit: null,
			page: null,
			order_by: null,
			order: null,
			start_date: null,
			end_date: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/stakes`;
		let params = '?';

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.order_by)) {
			params += `&order_by=${opts.order_by}`;
		}

		if (isString(opts.order)) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.start_date)) {
			params += `&start_date=${sanitizeDate(opts.start_date)}`;
		}

		if (isDatetime(opts.end_date)) {
			params += `&end_date=${sanitizeDate(opts.end_date)}`;
		}

		if (isString(opts.format)) {
			params += `&format=${opts.format}`;
		}

		if (params.length > 1) path += params;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Create exchange stakes for admin
	 * @param {string} name - Name of the stake pool 
	 * @param {number} user_id - User ID associated with the stake pool
	 * @param {string} currency - Currency of the stake pool
	 * @param {number} account_id - Account ID
	 * @param {number} apy - Annual Percentage Yield
	 * @param {number} min_amount - Minimum stake amount
	 * @param {number} max_amount - Maximum stake amount
	 * @param {boolean} early_unstake - Whether early unstake is allowed
	 * @param {string} status - Pool status (uninitialized/active/paused/terminated)
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.id - ID for existing stake pool (update only)
	 * @param {string} opts.reward_currency - Currency for rewards
	 * @param {number} opts.duration - Duration in days
	 * @param {boolean} opts.slashing - Whether slashing is enabled
	 * @param {number} opts.slashing_earning_percentage - Slashing percentage for earnings
	 * @param {number} opts.slashing_principle_percentage - Slashing percentage for principle
	 * @param {boolean} opts.onboarding - Whether pool is for onboarding
	 * @param {string} opts.disclaimer - Disclaimer text
	 * @return {object} A JSON object with the created stake
	 */
	createExchangeStakesByAdmin(
		name,
		user_id,
		currency,
		account_id,
		apy,
		min_amount,
		max_amount,
		early_unstake,
		status,
		opts = {
			reward_currency: null,
			duration: null,
			slashing: null,
			slashing_earning_percentage: null,
			slashing_principle_percentage: null,
			onboarding: null,
			disclaimer: null
		}
	) {
		const verb = 'POST';
		const path = `${this.baseUrl}/admin/stake`;
		const data = {
			name,
			user_id,
			currency,
			account_id,
			apy,
			min_amount,
			max_amount,
			early_unstake,
			status
		};

		if (isString(opts.reward_currency)) {
			data.reward_currency = opts.reward_currency;
		}

		if (isNumber(opts.duration)) {
			data.duration = opts.duration;
		}

		if (isBoolean(opts.slashing)) {
			data.slashing = opts.slashing;
		}

		if (isNumber(opts.slashing_earning_percentage)) {
			data.slashing_earning_percentage = opts.slashing_earning_percentage;
		}

		if (isNumber(opts.slashing_principle_percentage)) {
			data.slashing_principle_percentage = opts.slashing_principle_percentage;
		}

		if (isBoolean(opts.onboarding)) {
			data.onboarding = opts.onboarding;
		}

		if (isString(opts.disclaimer)) {
			data.disclaimer = opts.disclaimer;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Update exchange stakes for admin
	 * @param {number} id - ID of the stake pool to update
	 * @param {object} opts - Optional parameters
	 * @param {string} opts.name - Name of the stake pool 
	 * @param {number} opts.user_id - User ID associated with the stake pool
	 * @param {string} opts.currency - Currency of the stake pool
	 * @param {string} opts.reward_currency - Currency for rewards
	 * @param {number} opts.account_id - Account ID
	 * @param {number} opts.apy - Annual Percentage Yield
	 * @param {number} opts.duration - Duration in days
	 * @param {boolean} opts.slashing - Whether slashing is enabled
	 * @param {number} opts.slashing_earning_percentage - Slashing percentage for earnings
	 * @param {number} opts.slashing_principle_percentage - Slashing percentage for principle
	 * @param {boolean} opts.early_unstake - Whether early unstake is allowed
	 * @param {number} opts.min_amount - Minimum stake amount
	 * @param {number} opts.max_amount - Maximum stake amount
	 * @param {string} opts.status - Pool status (uninitialized/active/paused/terminated)
	 * @param {boolean} opts.onboarding - Whether pool is for onboarding
	 * @param {string} opts.disclaimer - Disclaimer text
	 * @return {object} A JSON object with the updated stake
	 */
	updateExchangeStakesByAdmin(
		id,
		opts = {
			name: null,
			user_id: null,
			currency: null,
			reward_currency: null,
			account_id: null,
			apy: null,
			duration: null,
			slashing: null,
			slashing_earning_percentage: null,
			slashing_principle_percentage: null,
			early_unstake: null,
			min_amount: null,
			max_amount: null,
			status: null,
			onboarding: null,
			disclaimer: null
		}
	) {
		const verb = 'PUT';
		const path = `${this.baseUrl}/admin/stake`;
		const data = { id };

		// Optional parameters
		if (isString(opts.name)) {
			data.name = opts.name;
		}

		if (isNumber(opts.user_id)) {
			data.user_id = opts.user_id;
		}

		if (isString(opts.currency)) {
			data.currency = opts.currency;
		}

		if (isString(opts.reward_currency)) {
			data.reward_currency = opts.reward_currency;
		}

		if (isNumber(opts.account_id)) {
			data.account_id = opts.account_id;
		}

		if (isNumber(opts.apy)) {
			data.apy = opts.apy;
		}

		if (isNumber(opts.duration)) {
			data.duration = opts.duration;
		}

		if (isBoolean(opts.slashing)) {
			data.slashing = opts.slashing;
		}

		if (isNumber(opts.slashing_earning_percentage)) {
			data.slashing_earning_percentage = opts.slashing_earning_percentage;
		}

		if (isNumber(opts.slashing_principle_percentage)) {
			data.slashing_principle_percentage = opts.slashing_principle_percentage;
		}

		if (isBoolean(opts.early_unstake)) {
			data.early_unstake = opts.early_unstake;
		}

		if (isNumber(opts.min_amount)) {
			data.min_amount = opts.min_amount;
		}

		if (isNumber(opts.max_amount)) {
			data.max_amount = opts.max_amount;
		}

		if (isString(opts.status) && ['uninitialized', 'active', 'paused', 'terminated'].includes(opts.status)) {
			data.status = opts.status;
		}

		if (isBoolean(opts.onboarding)) {
			data.onboarding = opts.onboarding;
		}

		if (isString(opts.disclaimer)) {
			data.disclaimer = opts.disclaimer;
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Delete exchange stakes for admin
	 * @param {object} data - ID object containing stake ID to delete
	 * @return {object} A JSON object with deletion result
	 */
	deleteExchangeStakesByAdmin(id) {
		const verb = 'DELETE';
		const path = `${this.baseUrl}/admin/stake`;
		const data = { id };

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Get exchange stakers of users for admin
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.id - Unique identifier for the staker entry
	 * @param {number} opts.user_id - The ID of the user who has locked funds and staked
	 * @param {number} opts.stake_id - The ID of the stake pool
	 * @param {string} opts.currency - The currency in which the user staked
	 * @param {number} opts.reward - The amount the user has received as rewards
	 * @param {number} opts.slashed - The amount slashed
	 * @param {number} opts.limit - Number of elements to return. Default: 50. Maximum: 100
	 * @param {number} opts.page - Page of data to retrieve
	 * @param {string} opts.order_by - Field to order data
	 * @param {string} opts.order - Direction to order (asc/desc)
	 * @param {string} opts.start_date - Starting date of queried data in ISO8601 format
	 * @param {string} opts.end_date - Ending date of queried data in ISO8601 format
	 * @param {string} opts.format - Specify data format (csv/all)
	 * @return {object} A JSON object with stakers data
	 */
	getExchangeStakersByAdmin(
		opts = {
			id: null,
			user_id: null,
			stake_id: null,
			currency: null,
			reward: null,
			slashed: null,
			limit: null,
			page: null,
			order_by: null,
			order: null,
			start_date: null,
			end_date: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/stakers`;
		let params = '?';

		if (isNumber(opts.id)) {
			params += `&id=${opts.id}`;
		}

		if (isNumber(opts.user_id)) {
			params += `&user_id=${opts.user_id}`;
		}

		if (isNumber(opts.stake_id)) {
			params += `&stake_id=${opts.stake_id}`;
		}

		if (isString(opts.currency)) {
			params += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.reward)) {
			params += `&reward=${opts.reward}`;
		}

		if (isNumber(opts.slashed)) {
			params += `&slashed=${opts.slashed}`;
		}

		if (isNumber(opts.limit)) {
			params += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			params += `&page=${opts.page}`;
		}

		if (isString(opts.order_by)) {
			params += `&order_by=${opts.order_by}`;
		}

		if (isString(opts.order)) {
			params += `&order=${opts.order}`;
		}

		if (isDatetime(opts.start_date)) {
			params += `&start_date=${sanitizeDate(opts.start_date)}`;
		}

		if (isDatetime(opts.end_date)) {
			params += `&end_date=${sanitizeDate(opts.end_date)}`;
		}

		if (isString(opts.format)) {
			params += `&format=${opts.format}`;
		}

		if (params.length > 1) path += params;
		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
	 * Get staking and unstaking amounts
	 * @return {object} A JSON object with stake analytics data
	 */
	getStakeAnalyticsByAdmin() {
		const verb = 'GET';
		const path = `${this.baseUrl}/admin/stake/analytics`;

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter
		);
		return createRequest(verb, `${this.apiUrl}${path}`, headers);
	}

	/**
 	* Block a user’s withdrawal ability
 	* @param {number} userId – The ID of the user to disable withdrawals for
 	* @param {string|null} expiryDate – ISO date‑time string when the block expires
 	* @return {object} A JSON object { message: "Success" }
 	*/
	disableUserWithdrawalByAdmin(userId, opts = { expiryDate : null }
		) {
		const verb = 'POST';
		const path = `${this.baseUrl}/admin/user/disable-withdrawal`;
		const data = {
			user_id: userId
		};

		if (opts.expiryDate !== null && isDatetime(opts.expiryDate)) {
			data.expiry_date = sanitizeDate(opts.expiryDate);
		}

		const headers = generateHeaders(
			this.headers,
			this.apiSecret,
			verb,
			path,
			this.apiExpiresAfter,
			data
		);

		return createRequest(verb, `${this.apiUrl}${path}`, headers, { data });
	}

	/**
	 * Connect to hollaEx websocket and listen to an event
	 * @param {array} events - The events to listen to
	 */
	connect(events = []) {
		this.wsReconnect = true;
		this.wsEvents = events;
		this.initialConnection = true;
		let url = this.wsUrl;
		if (this.apiKey && this.apiSecret) {
			const apiExpires = moment().unix() + this.apiExpiresAfter;
			const signature = createSignature(
				this.apiSecret,
				'CONNECT',
				'/stream',
				apiExpires
			);
			url = `${url}?api-key=${this.apiKey
				}&api-signature=${signature}&api-expires=${apiExpires}`;
		}

		this.ws = new WebSocket(url);

		if (this.wsEventListeners) {
			this.ws._events = this.wsEventListeners;
		} else {
			this.ws.on('unexpected-response', () => {
				if (this.ws.readyState !== WebSocket.CLOSING) {
					if (this.ws.readyState === WebSocket.OPEN) {
						this.ws.close();
					} else if (this.wsReconnect) {
						this.wsEventListeners = this.ws._events;
						this.ws = null;
						setTimeout(() => {
							this.connect(this.wsEvents);
						}, this.wsReconnectInterval);
					} else {
						this.wsEventListeners = null;
						this.ws = null;
					}
				}
			});

			this.ws.on('error', () => {
				if (this.ws.readyState !== WebSocket.CLOSING) {
					if (this.ws.readyState === WebSocket.OPEN) {
						this.ws.close();
					} else if (this.wsReconnect) {
						this.wsEventListeners = this.ws._events;
						this.ws = null;
						setTimeout(() => {
							this.connect(this.wsEvents);
						}, this.wsReconnectInterval);
					} else {
						this.wsEventListeners = null;
						this.ws = null;
					}
				}
			});

			this.ws.on('close', () => {
				if (this.wsReconnect) {
					this.wsEventListeners = this.ws._events;
					this.ws = null;
					setTimeout(() => {
						this.connect(this.wsEvents);
					}, this.wsReconnectInterval);
				} else {
					this.wsEventListeners = null;
					this.ws = null;
				}
			});

			this.ws.on('open', () => {
				if (this.wsEvents.length > 0) {
					this.subscribe(this.wsEvents);
				}

				this.initialConnection = false;

				setWsHeartbeat(this.ws, JSON.stringify({ op: 'ping' }), {
					pingTimeout: 60000,
					pingInterval: 25000
				});
			});
		}
	}

	/**
	 * Disconnect from hollaEx websocket
	 */
	disconnect() {
		if (this.wsConnected()) {
			this.wsReconnect = false;
			this.ws.close();
		} else {
			throw new Error('Websocket not connected');
		}
	}

	/**
	 * Subscribe to hollaEx websocket events
	 * @param {array} events - The events to listen to
	 */
	subscribe(events = []) {
		if (this.wsConnected()) {
			each(events, (event) => {
				if (!this.wsEvents.includes(event) || this.initialConnection) {
					const [topic, symbol] = event.split(':');
					switch (topic) {
						case 'orderbook':
						case 'trade':
							if (symbol) {
								if (!this.wsEvents.includes(topic)) {
									this.ws.send(
										JSON.stringify({
											op: 'subscribe',
											args: [`${topic}:${symbol}`]
										})
									);
									if (!this.initialConnection) {
										this.wsEvents = union(this.wsEvents, [event]);
									}
								}
							} else {
								this.ws.send(
									JSON.stringify({
										op: 'subscribe',
										args: [topic]
									})
								);
								if (!this.initialConnection) {
									this.wsEvents = this.wsEvents.filter(
										(e) => !e.includes(`${topic}:`)
									);
									this.wsEvents = union(this.wsEvents, [event]);
								}
							}
							break;
						case 'order':
						case 'usertrade':
						case 'wallet':
						case 'deposit':
						case 'withdrawal':
						case 'admin':
							this.ws.send(
								JSON.stringify({
									op: 'subscribe',
									args: [topic]
								})
							);
							if (!this.initialConnection) {
								this.wsEvents = union(this.wsEvents, [event]);
							}
							break;
						default:
							break;
					}
				}
			});
		} else {
			throw new Error('Websocket not connected');
		}
	}

	/**
	 * Unsubscribe to hollaEx websocket events
	 * @param {array} events - The events to unsub from
	 */
	unsubscribe(events = []) {
		if (this.wsConnected()) {
			each(events, (event) => {
				if (this.wsEvents.includes(event)) {
					const [topic, symbol] = event.split(':');
					switch (topic) {
						case 'orderbook':
						case 'trade':
							if (symbol) {
								this.ws.send(
									JSON.stringify({
										op: 'unsubscribe',
										args: [`${topic}:${symbol}`]
									})
								);
							} else {
								this.ws.send(
									JSON.stringify({
										op: 'unsubscribe',
										args: [topic]
									})
								);
							}
							this.wsEvents = this.wsEvents.filter((e) => e !== event);
							break;
						case 'order':
						case 'wallet':
						case 'deposit':
						case 'withdrawal':
						case 'admin':
							this.ws.send(
								JSON.stringify({
									op: 'unsubscribe',
									args: [topic]
								})
							);
							this.wsEvents = this.wsEvents.filter((e) => e !== event);
							break;
						default:
							break;
					}
				}
			});
		} else {
			throw new Error('Websocket not connected');
		}
	}
}

module.exports = HollaExKit;