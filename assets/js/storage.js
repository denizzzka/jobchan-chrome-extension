class SubscriptionsStorage {
	async #getByPageId(page_id) {
		console.assert(page_id !== undefined);

		return new Promise((resolve) => {
			chrome.runtime.sendMessage({
				"subsAction": "getOne",
				"page_id": page_id
			}, function(r) {
				resolve(r);
			});
		});
	}

	async bySub() {
		return new Promise((resolve) => {
			chrome.runtime.sendMessage({"subsAction": "getAll"}, function(r) {
				resolve(r);
			});
		});
	}

	async upsertSubscription(page_id, url, title, latest_activity_counter, markAsRead = true) {
		chrome.runtime.sendMessage({
			"subsAction": "upsertSubscription",
			"page_id": page_id,
			"url": url,
			"title": title,
			"latest_activity_counter": latest_activity_counter,
			"markAsRead": markAsRead
		});
	}

	async isSubscribed(page_id) {
		if(page_id === undefined)
			return false;

		const v = await this.#getByPageId(page_id);

		console.assert(v !== undefined);

		return v?.page_id === page_id;
	}

	async markAsReadIfSubscribed(page_id, latest_activity_counter) {
		chrome.runtime.sendMessage({
			"subsAction": "updateFromCustomJson",
			"page_id": page_id,
			"curr_activity_counter": latest_activity_counter,
			"latest_activity_counter": latest_activity_counter
		});
	}

	async getSortedSubscriptions() {
		const key = "subscriptions_list";

		const r = await this.bySub();

		const sorted = r
			.sort((a, b) => b.added - a.added);

		return sorted;
	}

	async deleteSubscription(page_id) {
		chrome.runtime.sendMessage({
				"subsAction": "removeOne",
				"page_id": page_id
		});
	}

	async getUnreadCount() {
		return new Promise((resolve) => {
			chrome.runtime.sendMessage({"subsAction": "getUnreadSubsCount"}, function(r) {
				resolve(r);
			});
		});
	}
}

const subscriptions = new SubscriptionsStorage();

const own_key = "pages";

const own_comments = {
	upsertComment: async(page_id, msg_id, secret) => {
		await chrome.storage.local.get(own_key).then((aa) => {
			let r = aa[own_key];

			if(r === undefined)
				r = {};

			if(r[page_id] === undefined)
				r[page_id] = {
					"page_id": page_id,
					"own_messages": {}
				};

			r[page_id].own_messages[msg_id] = {
				"msg_id": msg_id,
				"secret": secret,
				"added": Date.now(),
			};

			return r;
		}).then(
			async (r) => await chrome.storage.local.set({[own_key]: r})
		);
	},

	getCommentBelongings: (page_id, msg_id) => {
		return chrome.storage.local.get(own_key).then(
			(r) => r?.[own_key]?.[page_id]?.own_messages?.[msg_id]
		);
	},

	isCommentModifiable: async(page_id, msg_id) => {
		const timeout = 1000 * 60 * 60 * 24 * 2; // 2 days

		return await own_comments.getCommentBelongings(page_id, msg_id).
			then((r) => {
				if(r?.added === undefined)
					return false;
				else
					return (Date.now() - r.added) < timeout;
			});
	}
}
