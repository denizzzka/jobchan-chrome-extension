function addSubsList(page_id, url, title, newCount, isRemoved)
{
    const template = $("#subscriptionItemTpl")[0];

    const c = $( document.importNode(template.content, true) );

    c.find(".del_or_not > .approve").attr("data-page-uuid", page_id);
    c.find(".del_or_not > .decline").attr("data-page-uuid", page_id);
    c.find(".page-link").attr("href", url);
    c.find(".page-link").text(title);

    if(newCount > 0)
    {
        c.find(".subscription-link").addClass("have-unread");
        c.find(".subscription-link .unread-val").text(newCount);
    }
    else
        c.find(".subscription-link .unread").hide();

    if(isRemoved)
        c.find(".subscription-link").addClass('removed');

    $('#subscriptionsList').append(c);
}

document.addEventListener("DOMContentLoaded", async () => {
    chrome.action.getBadgeText({}, (t) => {
        if(t == " ! ")
            $('#cwc-error').show();
    });

    document.toUnsubscribe = [];

    const s = await subscriptions.getSortedSubscriptions();
    s.forEach((e) => addSubsList(e.page_id, e.url, e.title, e.latest_activity_counter - e.curr_activity_counter, e.isRemoved));
});

$(document).on('click', '.decline', function(e) {
    let t = $(e.target);
    const page_id = t.attr("data-page-uuid");

    t.attr("hidden", true);
    $(`.approve[data-page-uuid="${page_id}"]`).removeAttr("hidden");

    document.toUnsubscribe = document.toUnsubscribe
        .filter((a) => a != page_id);

    if(document.toUnsubscribe.length == 0)
        $("#unsubBtn").attr("disabled", true);
});

$(document).on('click', '.approve', function(e) {
    let t = $(e.target);
    const page_id = t.attr("data-page-uuid");

    t.attr("hidden", true);
    $(`.decline[data-page-uuid="${page_id}"]`).removeAttr("hidden");

    document.toUnsubscribe.push(page_id);
    $("#unsubBtn").removeAttr("disabled");
});

$(document).on('click', '#unsubBtn', async function(e) {
    for (const page_id of document.toUnsubscribe)
    {
        await subscriptions.deleteSubscription(page_id);
    }

    document.toUnsubscribe = [];

    window.location.reload();
});
