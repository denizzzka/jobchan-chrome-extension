function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

const elemsPerPage = 15;

function fillNav(currPage, numOfPages)
{
    const curr_url = window.location.origin + window.location.pathname;

    if(currPage == 1)
        $('.nav').append($(`<span class="page-number">←</span>`));
    else
        $('.nav').append($(`<a class="page-number" href="${curr_url}?page=${currPage-1}" rel="prev">←</a>`));

    for (let i = 1; i <= numOfPages; i++) {
        if(i != currPage)
            $('.nav').append($(`<a class="page-number" href="${curr_url}?page=${i}">${i}</a>`));
        else
            $('.nav').append($(`<strong class="page-number">${i}</strong>`));
    }

    if(currPage == numOfPages)
        $('.nav').append($(`<span class="page-number">→</span>`));
    else
        $('.nav').append($(`<a class="page-number" href="${curr_url}?page=${currPage - (-1)}" rel="next">→</a>`));
}

function addToDisplay(url, title, commentsCount, timestamp)
{
    const template = $("#recentItemTpl")[0];

    const c = $( document.importNode(template.content, true) );

    c.find(".page-link").attr("href", url);
    c.find(".page-link").text(title);
    c.find(".subscription-link .msgs-cnt").text(commentsCount);
    c.find(".subscription-link .timestamp").text(timestamp);

    $('#recentList').append(c);
}

document.addEventListener("DOMContentLoaded", async () => {
    let currPage = getUrlParameter('page');
    if(currPage === null)
        currPage = 1;

    const r = await request({
            action: 'getRecentCommentedList',
            "offset": currPage * elemsPerPage - elemsPerPage,
            "limit": elemsPerPage
    });

    const numOfPages = Math.ceil(r.total / elemsPerPage);

    fillNav(currPage, numOfPages);

    r.recently_commented_list.forEach((e) => addToDisplay(e.url, e.title, e.commentsCount, e.new_added));

    // Update unread count for subscriptions links
    const unreadCount = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ subsAction: "getUnreadSubsCount" }, (response) => {
            resolve(response);
        });
    });
    if (unreadCount > 0) {
        $('.no-unread').hide();
        $('.with-unread').show();
        $('.unread-num').text(unreadCount);
        $('.top-subscriptions-link').show();
    } else {
        $('.no-unread').show();
        $('.with-unread').hide();
        $('.top-subscriptions-link').hide();
    }
});

async function request(args, post_args ={})
{
    /* args["url"] = app.getURL(); */

    let data;

    try
    {
        data = await requester.request(args, post_args);

        if(data?.error)
            throw "data error";

        return data;
    }
    catch(err)
    {
        $('#cwc-error').show();

        console.log("Нет связи с сервером?", err);

        // Return default response to prevent undefined access
        return { total: 0, recently_commented_list: [] };
    }
}

$(document).on('auxclick', '.page-link', function(e) {
    if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        chrome.tabs.create({ url: $(this).attr('href'), active: false });
    }
});
