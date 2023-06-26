// ==UserScript==
// @name         FundaEnergyLabelPlayground
// @namespace    com.parker.david
// @version      Alpha-v1
// @description  Try to enrich funda pages with energy labels
// @author       David Parker
// @require      http://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js
// @require      https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require      https://greasyfork.org/scripts/401399-gm-xhr/code/GM%20XHR.js
// @match        https://www.funda.nl/huur/*
// @match        https://www.funda.nl/koop/*
// @match        https://www.funda.nl/zoeken/huur/*
// @match        https://www.funda.nl/zoeken/koop/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=funda.nl
// @grant       GM_xmlhttpRequest
// @grant       GM.xmlhttpRequest
// @connect     www.ep-online.nl
// ==/UserScript==
(async () => {

//debugger;
'use strict';

const eponline = 'https://www.ep-online.nl/Energylabel/Search'
$.ajaxSetup({ xhr: function() {return new GM_XHR; } });

function Request(url, opt={}) {
	Object.assign(opt, {
		url,
		timeout: 2000,
		responseType: 'json'
	})
	return new Promise((resolve, reject) => {
		opt.onerror = opt.ontimeout = reject
		opt.onload = resolve
		GM_xmlhttpRequest(opt)
	})
}


// $( ".search-result" ).function().css( "border", "3px solid red" );

//doStuff.call( $(".search-result-main")[0] );
function doStuff() {

    var address = extractAddress($(this).children('a').eq(0).text().trim());
    var postcode = extractPostcode($(this).children('a').eq(1).text().trim());
    var eponlineString = postcode + ' ' + address
    var energyLabelNode = $(this).children('a').first().clone().empty().text("Energy Label: " + eponlineString);
//    var newNode = $(this).children('a').eq(1).text("Energy Label");

    $(this).append(energyLabelNode);
}

function extractPostcode(base){
    var parts = base.split(' ');
    return parts[0] + parts[1];
}

function extractAddress(base){
    //get last number
    var number = base.match('\(\\d\+\)\(\?\!\.\*\\d\)')[0];
    //get last character
    var letter = base.match('\[a\-zA\-Z\]\(\?\!\.\*\[a\-zA\-Z\]\)')[0];
    // if ends with letter, return number+letter, else just number
    return (base.slice(-1) == letter) ? number + ' ' + letter : number
}

function extractToken(response){
    var parser = new DOMParser ();
    var responseDoc = parser.parseFromString (response.responseText, "text/html");
    var token = responseDoc.querySelector('[name="__RequestVerificationToken"]').value;
    return token
}

function getLabelInfo(address, token){
    return $.ajax({
        url: eponline,
        type: 'POST',
        data: {
            __RequestVerificationToken:token,
            SearchValue:address
        },
        header: {Cookie:"null=0"},
        dataType: 'JSON',
        contentType:'application/x-www-form-urlencoded; charset=utf-8'
    })
}

//const tokenPromise = Request(eponline, {method: 'GET'})
// const token = await tokenPromise.then(function(data){return new Promise((resolve,reject) => {resolve=extractToken(data)})})
//const token = await tokenPromise.then(extractToken)
//console.log(token)



function getTokenXhr(){
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            onerror:reject,
            ontimeout:reject,
            onload: resolve,
            timeout:5000,
            url:eponline,
            method: 'GET',
            responseType: 'json'
        })
    })
}

function getLabelXhr(token, address){
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            onerror:reject,
            ontimeout:reject,
            onload: resolve,
            timeout:5000,
            url:eponline,
            method: 'POST',
            responseType: 'json',
            headers:    {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data:new URLSearchParams({
                __RequestVerificationToken:token,
                SearchValue:address
            })
        })
    })
}

function extractTokenPromise(data){
  return new Promise((resolve,reject) => {
    var token = extractToken(data)
    resolve(token)
  })
}

function extractLabel(response, address, postcode){
    var parser = new DOMParser ();
    var responseDoc = parser.parseFromString (response.responseText, "text/html");

    var labelBlock = Array.from(responseDoc.querySelectorAll('.se-result-item-nta.se-sm-noborder'))
    .filter((doc)=>{
      //empty = false, else true
      return doc.querySelector('span.sort-value-pht.text-nowrap').textContent.trim() === postcode+' '+address
    })[0]
    return labelBlock
}

function extractLabelPromise(data){
    return new Promise((resolve, reject) => {
      let labelResponse = data[1]
      let dataObj = data[0]
      let labelNode = extractLabel(labelResponse, dataObj.address, dataObj.postcode)
      resolve({node:dataObj.node, labelNode:labelNode, postcode:dataObj.postcode, address:dataObj.address})
  })
}

function extractAddressNodes(doc){
  let searchResultBase = doc.querySelectorAll(".search-result-main, .search-result-main-promo")
  let results = Array.from(searchResultBase)
  .map(node=>{
    let address = extractAddress(node.querySelector('.search-result__header-title.fd-m-none').textContent.trim());
    let postcode = extractPostcode(node.querySelector('.search-result__header-subtitle.fd-m-none').textContent.trim());
    return {node, address, postcode};
  })
  return results;
}

function extractAddressNodesPromise(token){
  return new Promise((resolve, reject)=>{
      resolve({token:token, results:extractAddressNodes(document)}
    )})
}

function composeNodes(data){
  //add energy label
  data.filter(prom => prom.status === 'fulfilled').forEach((x) => {x.value.node.append(x.value.labelNode); return x})

  //add WOZ

  //return
  return Promise.resolve(data)
}


// get label of each node, and return promise([promise(node), promise(label)])[]
function getLabels(input){
  // e = {node, address, postcode}
  let promises = input.results.map(
    e => Promise.all([Promise.resolve({node:e.node, postcode:e.postcode, address:e.address}), getLabelXhr(input.token, e.postcode+' '+e.address)])
    .then(extractLabelPromise)
  )
  return Promise.allSettled(promises);
}

// const call = await getToken().then(tokenPromise).then(extractAddressNodes).then(getLabel).then(extractLabels).then(console.log).catch((reason)=>console.log(reason))
const call = await getTokenXhr().then(extractTokenPromise).then(extractAddressNodesPromise).then(getLabels).then(composeNodes).then(console.log).catch((reason)=>console.log(reason))
//const call = await getToken().then(tokenPromise).then(extractAddressNodesPromise).then(getLabels).then(extractLabels).then(applyLabels).then(console.log).catch((reason)=>console.log(reason))

//make onload return promise
//chain this to next function


/*
const promiseA = new Promise((resolve, reject) => {
  resolve(777);
});
// At this point, "promiseA" is already settled.
promiseA.then((val) => console.log("asynchronous logging has val:", val));
console.log("immediate logging");
*/


/*
var filter   = Array.prototype.filter,
    result   = document.querySelectorAll('div'),
    filtered = filter.call( result, function( node ) {
        return !!node.querySelectorAll('span').length;
    });

let k = document.querySelectorAll('[ data-parent=true]').forEach(function(item) {
  let elem = item.querySelector('[data-child-gender=true]');
  if (elem !== null && elem.innerHTML.trim() === 'male') {
    console.log(item.id)
  }
})
*/

//var token = getToken().done(function(html){
//     console.log(html.data);
//})



//getLabelInfo('2665BH 105').done(function( html ) {
//    console.log(html);
//    $( "#results" ).append( html );
//  });


/*
$.ajax({
    data:
    {
        __RequestVerificationToken:"CfDJ8Gkx_Jjze1JGvE7h9mrsL5_x87cAGUCJyDIyQxWZBbGJjt_ajF6ZTtO8eMbA57nsOXmnHdcpSnNIV84EgZ7nEzMQjfyI6jZQWrwRosZgU8RlUM8R2D5hQwPqhh7_2huOt-pqgoKEiUVWDUuNoo2PEko",
        SearchValue:'2665BH+105'
    },
    type: 'POST',
    dataType: 'json',
    headers: { 'Cookie': '.AspNetCore.Antiforgery.PUaSdZbJ5i8=CfDJ8Gkx_Jjze1JGvE7h9mrsL5_x87cAGUCJyDIyQxWZBbGJjt_ajF6ZTtO8eMbA57nsOXmnHdcpSnNIV84EgZ7nEzMQjfyI6jZQWrwRosZgU8RlUM8R2D5hQwPqhh7_2huOt-pqgoKEiUVWDUuNoo2PEko' },
    contentType:'application/x-www-form-urlencoded; charset=utf-8',
    url: eponline
}).done(function(data) {
    // If successful
    console.log(data);
}).fail(function(jqXHR, textStatus, errorThrown) {
    // If fail
    console.log(textStatus + ': ' + errorThrown);
});
*/
/*
$.ajax({
        url: "/scripts/S9/1.json",
        type: "GET",
        dataType: "json"
    });
*/
//token.done(function(){console.log(this)})
//$(".search-result__header-title-col").each( doStuff );

///----

/*$selector.on('load', function(){
    var deferreds = $(this).find(".search-result__header-title-col").map(
        function() {
            var ajax = $.ajax({
                getToken().then()
            }
        }
    )
});


//-----
$selector.on('click', function() {
    // Map returned deferred objects
    var deferreds = $(this).find('div').map(function() {
        var ajax = $.ajax({
            url: $(this).data('ajax-url'),
            method: 'get'
        });

        return ajax;
    });

    // Use .apply onto array from deferreds
    // Remember to use .get()
    $.when.apply($, deferreds.get()).then(function() {
        // Things to do when all is done
    });
});
*/

})();