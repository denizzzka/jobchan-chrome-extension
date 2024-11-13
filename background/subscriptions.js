const _storeName = 'pages';

class SubscriptionsStorage {
    dbConn = null;

    async #initDB() {
        return new Promise((resolve, reject) => {
            const dbDescriptor = indexedDB.open("subscriptions", 1);

            dbDescriptor.onupgradeneeded = (e) => {
                e.target.result.createObjectStore(_storeName, { keyPath: 'page_id' });
            };

            dbDescriptor.onsuccess = (e) => {
                resolve(e.target.result);
            };

            dbDescriptor.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }

    constructor()
    {
        this.dbConn = this.#initDB();

        chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
                if (m?.subsAction === undefined)
                    return;

                switch(m.subsAction)
                {
                    case "upsertSubscription":
                        this.#upsertSubscription(m);
                        break;

                    case "removeOne":
                        this.#removePageFromSubs(m.page_id);
                        break;

                    case "getOne":
                        this.#getOne(m.page_id).then(r => { sendResponse(r); });
                        return true;
                        break;

                    case "getAll":
                        this.getAllSubs().then(r => { sendResponse(r); });
                        return true;
                        break;

                    case "getUnreadSubsCount":
                        this.getUnreadSubsCount().then(r => { sendResponse(r); });
                        return true;
                        break;

                    case "updateFromCustomJson":
                        this.#updateFromCustomJson(m);
                        break;

                    default:
                        throw new Error('Unsupported action');
                }
        });
    }

    async getAllSubs() {
        const db = await this.dbConn;

        return new Promise((resolve, reject) => {
            const tr = db.transaction([_storeName], "readonly");
            const store = tr.objectStore([_storeName]);
            const req = store.getAll();

            req.onsuccess = (e) => {
                resolve(e.target.result);
            };

            req.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }

    async isAnySubStored() {
        //TODO: replace by db_object.count()
        const r = await this.getAllSubs();

        return r.length > 0;
    }

    async #operateOverOneSub(page_id, dg, access)
    {
        const db = await this.dbConn;

        return new Promise((resolve, reject) => {
            const tr = db.transaction([_storeName], access);
            const store = tr.objectStore([_storeName]);

            const select = store.get(page_id);
            select.onsuccess = (e) => {
                resolve(dg(e.target.result, store, tr));
            }

            select.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }

    async #getOne(page_id)
    {
        return await this.#operateOverOneSub(page_id, (row, store, tr) => {
            return row;
        }, "readonly");
    }

    async #updateFromCustomJson(json)
    {
        await this.#operateOverOneSub(json.page_id, (row, store, tr) => {
            if(row === undefined)
                return;

            Object.keys(json)
                .filter(e => e != "subsAction")
                .filter(e => e != "page_id")
                .forEach(e => row[e] = json[e]);

            store.put(row);
        }, "readwrite");

        await app.refreshSubscrVisualisation();
    }

    async setRemoved(page_id) {
        this.#updateFromCustomJson({
            "page_id": page_id,
            "isRemoved": true
        });
    }

    async setActivityCounterIfSubscribed(page_id, latest_activity_counter) {
        this.#updateFromCustomJson({
            "page_id": page_id,
            "latest_activity_counter": latest_activity_counter
        });
    }

    async #upsertSubscription(j) {
        const db = await this.dbConn;

        return new Promise((resolve, reject) => {
            const tr = db.transaction([_storeName], "readwrite");
            const store = tr.objectStore([_storeName]);

            const select = store.get(j.page_id);
            select.onsuccess = (e) => {
                let r = e.target.result;

                if(r === undefined)
                {
                    console.assert(j.markAsRead == true);

                    r = {
                        "page_id": j.page_id,
                        "url": j.url,
                        "title": j.title,
                        "added": Date.now(),
                        "latest_activity_counter": j.latest_activity_counter,
                        "isRemoved": false
                    };
                }
                else
                {
                    r["url"] = j.url;
                    r["title"] = j.title;
                    r["latest_activity_counter"] = j.latest_activity_counter;
                }

                console.assert(j.markAsRead !== undefined);

                if(j.markAsRead == true)
                    r["curr_activity_counter"] = j.latest_activity_counter;

                const upsert = store.put(r);

                upsert.onsuccess = (e) => {
                    app.setSubsUpdateAlarm();
                    app.refreshSubscrVisualisation();
                };

                upsert.onerror = (e) => {
                    console.error("write failed: ", e);
                    reject(e.target.error);
                };
            }

            select.onerror = (e) => {
                console.error("select failed: ", e);
                reject(e.target.error);
            };
        });
    }

    async #removePageFromSubs(page_id) {
        const db = await this.dbConn;

        const r = await new Promise((resolve, reject) => {
            const tr = db.transaction([_storeName], "readwrite");
            const store = tr.objectStore([_storeName]);
            const req = store.delete(page_id);

            req.onsuccess = (e) => {
                app.refreshSubscrVisualisation();
            };

            req.onerror = (e) => {
                console.log("deletion failed: ", e);
            };
        });

        return r;
    }

    async getUnreadSubsCount() {
        const unreadSubsFlags = (await this.getAllSubs())
            .map((e) => e.curr_activity_counter < e.latest_activity_counter);

        const unreadNum = unreadSubsFlags
            .map((isUnread) => isUnread ? 1 : 0)
            .reduce((ret, i) => ret + i, 0);

        return unreadNum;
    }
}
