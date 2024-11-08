class SubscriptionsStorage {
	async #getSubsArray() {
		const key = "subscriptions_list";

		const r = await chrome.storage.local.get(key).then((r) => r?.[key]);

		if(r === undefined)
			return [];

		// TODO: Иногда почему-то null встречаются - разобраться!
		return r.filter((e) => e != null);
	}

	async #insertToSubsArray(page_id) {
		const key = "subscriptions_list";

		let r = await this.#getSubsArray();

		r.push(page_id);

		chrome.storage.local.set({[key]: r});
	}

	async #removeListFromSubsArray(page_ids) {
		let r = await this.#getSubsArray();

		if(r === undefined)
			return;

		r = r.filter((e) => e.includes(page_ids) == false);

		const key = "subscriptions_list";

		chrome.storage.local.set({[key]: r});
	}

	#getKey(page_id) { return "subscription:" + page_id; }

	async #getByPageId(page_id) {
		const key = this.#getKey(page_id);

		const j = await chrome.storage.local.get(key);

		return j?.[key];
	}

	#setByPageId(page_id, v) {
		const key = this.#getKey(page_id);

		return chrome.storage.local.set({ [key]: v });
	}

	async bySub() {
		const r = await this.#getSubsArray();

		return await Promise.all(
			r.map(async(id) => await this.#getByPageId(id))
		);
	}

	async upsertSubscription(page_id, url, title, latest_activity_counter) {
		let r = await this.#getByPageId(page_id);

		if(r === undefined)
		{
			r = {
				"page_id": page_id,
				"url": url,
				"title": title,
				"added": Date.now(),
				"curr_activity_counter": latest_activity_counter,
				"latest_activity_counter": latest_activity_counter,
				"isRemoved": false
			};

			this.#insertToSubsArray(page_id);
		}
		else
		{
			r["url"] = url;
			r["title"] = title;
			r["latest_activity_counter"] = latest_activity_counter;
		}

		this.#setByPageId(page_id, r);
	}

	async isSubscribed(page_id) {
		const v = await this.#getByPageId(page_id);

		return v !== undefined;
	}

	async markAsReadIfSubscribed(page_id, latest_activity_counter) {
		const r = await this.#getByPageId(page_id);

		if(r !== undefined)
		{
			r.curr_activity_counter = latest_activity_counter;
			r.latest_activity_counter = latest_activity_counter;
		}

		await this.#setByPageId(page_id, r);
	}

	async setActivityCounterIfSubscribed(page_id, latest_activity_counter) {
		const r = await this.#getByPageId(page_id);

		if(r !== undefined)
		{
			r.latest_activity_counter = latest_activity_counter;
			r.isRemoved = false;
		}

		await this.#setByPageId(page_id, r);
	}

	async setRemoved(page_id) {
		const r = await this.#getByPageId(page_id);

		if(r !== undefined)
			r.isRemoved = true;

		await this.#setByPageId(page_id, r);
	}

	async getSortedSubscriptions() {
		const key = "subscriptions_list";

		const r = await this.bySub();

		const sorted = r
			.sort((a, b) => a.added - b.added);

		return sorted;
	}

	async deleteSubscription(page_id) {
		const e = [page_id];
		await this.#removeListFromSubsArray(e);

		const key = this.#getKey(page_id);
		await chrome.storage.local.remove(key);
	}

	async isSubsStored() {
		const r = await this.#getSubsArray();

		return r.length > 0;
	}

	async getUnreadCount() {
		const unreadSubsFlags = (await this.bySub())
			.map((e) => e.curr_activity_counter < e.latest_activity_counter);

		const unreadNum = unreadSubsFlags
			.map((isUnread) => isUnread ? 1 : 0)
			.reduce((ret, i) => ret + i, 0);

		return unreadNum;
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
