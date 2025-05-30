function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

const elemsPerPage = 20;

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
    }
}
