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
		this.wsUrl =
			protocol === 'https'
				? `wss://${endpoint}/stream`
				: `ws://${endpoint}/stream`;
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
		let path = `${this.baseUrl}/user/deposits?`;

		if (isString(opts.currency)) {
			path += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order)) {
			path += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			path += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			path += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.address)) {
			path += `&address=${opts.address}`;
		}

		if (isString(opts.transactionId)) {
			path += `&transaction_id=${opts.transactionId}`;
		}

		if (isBoolean(opts.status)) {
			path += `&status=${opts.status}`;
		}

		if (isBoolean(opts.dismissed)) {
			path += `&dismissed=${opts.dismissed}`;
		}

		if (isBoolean(opts.rejected)) {
			path += `&rejected=${opts.rejected}`;
		}

		if (isBoolean(opts.processing)) {
			path += `&processing=${opts.processing}`;
		}

		if (isBoolean(opts.waiting)) {
			path += `&waiting=${opts.waiting}`;
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
		let path = `${this.baseUrl}/user/withdrawals?`;

		if (isString(opts.currency)) {
			path += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order)) {
			path += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			path += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			path += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.address)) {
			path += `&address=${opts.address}`;
		}

		if (isString(opts.transactionId)) {
			path += `&transaction_id=${opts.transactionId}`;
		}

		if (isBoolean(opts.status)) {
			path += `&status=${opts.status}`;
		}

		if (isBoolean(opts.dismissed)) {
			path += `&dismissed=${opts.dismissed}`;
		}

		if (isBoolean(opts.rejected)) {
			path += `&rejected=${opts.rejected}`;
		}

		if (isBoolean(opts.processing)) {
			path += `&processing=${opts.processing}`;
		}

		if (isBoolean(opts.waiting)) {
			path += `&waiting=${opts.waiting}`;
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
		let path = `${this.baseUrl}/user/trades?`;

		if (isString(opts.symbol)) {
			path += `&symbol=${opts.symbol}`;
		}

		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order)) {
			path += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			path += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			path += `&end_date=${sanitizeDate(opts.endDate)}`;
		}

		if (isString(opts.format)) {
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
		let path = `${this.baseUrl}/orders?`;

		if (isString(opts.symbol)) {
			path += `&symbol=${opts.symbol}`;
		}

		if (isString(opts.side) && (opts.side.toLowerCase() === 'buy' || opts.side.toLowerCase() === 'sell')) {
			path += `&side=${opts.side}`;
		}

		if (isString(opts.status)) {
			path += `&status=${opts.status}`;
		}

		if (isBoolean(opts.open)) {
			path += `&open=${opts.open}`;
		}

		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order)) {
			path += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			path += `&start_date=${sanitizeDate(opts.startDate)}`;
		}

		if (isDatetime(opts.endDate)) {
			path += `&end_date=${sanitizeDate(opts.endDate)}`;
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
		let path = `${this.baseUrl}/admin/deposits?`;

		
		if (isNumber(opts.userId)) {
			path += `&user_id=${opts.userId}`;
		}

		if (isString(opts.currency)) {
			path += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			path += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			path += `&start_date=${opts.startDate}`;
		}

		if (isDatetime(opts.endDate)) {
			path += `&end_date=${opts.endDate}`;
		}

		if (isBoolean(opts.status)) {
			path += `&status=${opts.status}`;
		}

		if (isBoolean(opts.dismissed)) {
			path += `&dismissed=${opts.dismissed}`;
		}

		if (isBoolean(opts.rejected)) {
			path += `&rejected=${opts.rejected}`;
		}

		if (isBoolean(opts.processing)) {
			path += `&processing=${opts.processing}`;
		}

		if (isBoolean(opts.waiting)) {
			path += `&waiting=${opts.waiting}`;
		}

		if (isString(opts.transactionId)) {
			path += `&transaction_id=${opts.transactionId}`;
		}

		if (isString(opts.address)) {
			path += `&address=${opts.address}`;
		}

		if (isString(opts.format) && opts.format === 'csv') {
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
		let path = `${this.baseUrl}/admin/withdrawals?`;

		if (isString(opts.currency)) {
			path += `&currency=${opts.currency}`;
		}

		if (isNumber(opts.userId)) {
			path += `&user_id=${opts.userId}`;
		}

		if (isString(opts.transactionId)) {
			path += `&transaction_id=${opts.transactionId}`;
		}

		if (isString(opts.address)) {
			path += `&address=${opts.address}`;
		}

		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}

		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}

		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}

		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			path += `&order=${opts.order}`;
		}

		if (isDatetime(opts.startDate)) {
			path += `&start_date=${opts.startDate}`;
		}

		if (isDatetime(opts.endDate)) {
			path += `&end_date=${opts.endDate}`;
		}

		if (isBoolean(opts.status)) {
			path += `&status=${opts.status}`;
		}

		if (isBoolean(opts.dismissed)) {
			path += `&dismissed=${opts.dismissed}`;
		}

		if (isBoolean(opts.rejected)) {
			path += `&rejected=${opts.rejected}`;
		}

		if (isBoolean(opts.processing)) {
			path += `&processing=${opts.processing}`;
		}

		if (isBoolean(opts.waiting)) {
			path += `&waiting=${opts.waiting}`;
		}

		if (isString(opts.format) && opts.format === 'csv') {
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
		let path = `${this.baseUrl}/admin/transfer?`;
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
		let path = `${this.baseUrl}/admin/mint?`;
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
		let path = `${this.baseUrl}/admin/burn?`;
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
		let path = `${this.baseUrl}/admin/burn?`;
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
		let path = `${this.baseUrl}/admin/check-transaction?`;
	
		if (isString(currency)) {
			path += `&currency=${currency}`;
		}
	
		if (isString(transactionId)) {
			path += `&transaction_id=${transactionId}`;
		}
	
		if (isString(address)) {
			path += `&address=${address}`;
		}
	
		if (isString(network)) {
			path += `&network=${network}`;
		}
	
		if (isBoolean(opts.isTestnet)) {
			path += `&is_testnet=${opts.isTestnet}`;
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
			startDate: null,
			format: null
		}
	) {
		const verb = 'GET';
		let path = `${this.baseUrl}/admin/trades?`;
		
		if (isNumber(opts.userId)) {
			path += `&user_id=${opts.userId}`;
		}
	
		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}
	
		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}
	
		if (isString(opts.symbol)) {
			path += `&symbol=${opts.symbol}`;
		}
	
		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}
	
		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			path += `&order=${opts.order}`;
		}
	
		if (isDatetime(opts.startDate)) {
			path += `&start_date=${opts.startDate}`;
		}
	
		if (isDatetime(opts.startDate)) {
			path += `&end_date=${opts.startDate}`;
		}
	
		if (isString(opts.format) && opts.format === 'csv') {
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
		let path = `${this.baseUrl}/admin/orders?`;
		
		if (isNumber(opts.userId)) {
			path += `&user_id=${opts.userId}`;
		}
	
		if (isString(opts.side) && (opts.side === 'buy' || opts.side === 'sell')) {
			path += `&side=${opts.side}`;
		}
		
		if (isString(opts.status)) {
			path += `&status=${opts.status}`;
		}
	
		if (isBoolean(opts.open)) {
			path += `&open=${opts.open}`;
		}
	
		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}
	
		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}
	
		if (isString(opts.symbol)) {
			path += `&symbol=${opts.symbol}`;
		}
	
		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}
	
		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			path += `&order=${opts.order}`;
		}
	
		if (isDatetime(opts.startDate)) {
			path += `&start_date=${opts.startDate}`;
		}
	
		if (isDatetime(opts.endDate)) {
			path += `&end_date=${opts.endDate}`;
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
	 * Cancel user's order by order id
	 * @param {number} userId - The identifier of the user
	 * @param {string} orderId - The identifier of the order
	 * @return {object} A JSON object with message
	 */
	cancelExchangeUserOrder(userId, orderId) {
		const verb = 'DELETE';
		let path = `${this.baseUrl}/admin/order?`;
	
		if (isString(orderId)) {
			path += `&order_id=${orderId}`;
		}
	
		if (isNumber(userId)) {
			path += `&user_id=${userId}`;
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
	 * Retrieve list of the user info by admin
	 * @param {object} opts - Optional parameters
	 * @param {number} opts.userId - The identifier of the user to filter by
	 * @param {string} opts.search - The search text to filter by, pass undefined to receive data on all fields
	 * @param {boolean} opts.pending - The pending field to filter by, pass undefined to receive all data
	 * @param {string} opts.pendingType - Th pending type info to filter by, pass undefined to receive data
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
			userId: null,
			search: null,
			type: null,
			pending: null,
			pendingType: null,
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
		let path = `${this.baseUrl}/admin/users?`;
		
		if (isNumber(opts.userId)) {
			path += `&id=${opts.userId}`;
		}
	
		if (isString(opts.search)) {
			path += `&search=${opts.search}`;
		}
		
		if (isString(opts.type)) {
			path += `&type=${opts.type}`;
		}
	
		if (isBoolean(opts.pending)) {
			path += `&pending=${opts.pending}`;
		}
	
		if (isString(opts.pendingType) && (opts.pendingType === 'id' ||opts.pendingType === 'bank')) {
			path += `&pending_type=${opts.pendingType}`;
		}
	
		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}
	
		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}
	
		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}
	
		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			path += `&order=${opts.order}`;
		}
	
		if (isDatetime(opts.startDate)) {
			path += `&start_date=${opts.startDate}`;
		}
	
		if (isDatetime(opts.endDate)) {
			path += `&end_date=${opts.endDate}`;
		}
	
		if (isString(opts.format) && opts.format === 'csv') {
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
	 * Create exchange user
	 * @param {string} email - The mail address for the user
	 * @param {string} password - The password for the user
	 * @return {object} A JSON object with message
	 */
	createExchangeUser(email, password) {
		const verb = 'POST';
		let path = `${this.baseUrl}/admin/user`;
		const data = {
			email,
			password
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
	
		if(isObject(opts.meta)){
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
	
		if(isNumber(opts.discount) && opts.discount <= 100 && opts.discount >= 0){
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
	
		if(isString(opts.note)){
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
	
		if(isNumber(opts.verification_level)){
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
	 * Create wallet for exchange user
	 * @param {number} userId - The identifier of the user
	 * @param {string} crypto - The coin for the wallet e.g btc, eth 
	 * @param {string} opts.network - The network info 
	 * @return {object} A JSON object with message
	 */
	createExchangeUserWallet(
		userId,
		crypto,
		opts= {
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
	 * @param {object} bankAccount - Object with bank account info
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
		let path = `${this.baseUrl}/admin/logins?`;
		
		if (isNumber(opts.userId)) {
			path += `&user_id=${opts.userId}`;
		}
	
		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}
	
		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}
	
		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}
	
		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			path += `&order=${opts.order}`;
		}
	
		if (isDatetime(opts.startDate)) {
			path += `&start_date=${opts.startDate}`;
		}
	
		if (isDatetime(opts.endDate)) {
			path += `&end_date=${opts.endDate}`;
		}
	
		if (isString(opts.format) && opts.format === 'csv') {
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
		let path = `${this.baseUrl}/admin/user/affiliation?`;
	
		
		if (isNumber(userId)) {
			path += `&user_id=${userId}`;
		}
	
		if (isNumber(opts.limit)) {
			path += `&limit=${opts.limit}`;
		}
	
		if (isNumber(opts.page)) {
			path += `&page=${opts.page}`;
		}
	
		if (isString(opts.orderBy)) {
			path += `&order_by=${opts.orderBy}`;
		}
	
		if (isString(opts.order) && (opts.order === 'asc' || opts.order === 'desc')) {
			path += `&order=${opts.order}`;
		}
	
		if (isDatetime(opts.startDate)) {
			path += `&start_date=${opts.startDate}`;
		}
	
		if (isDatetime(opts.endDate)) {
			path += `&end_date=${opts.endDate}`;
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
			url = `${url}?api-key=${
				this.apiKey
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
