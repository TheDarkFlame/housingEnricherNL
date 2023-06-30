// ==UserScript==
// @name         housingEnricherNL
// @namespace    com.parker.david
// @version      Alpha-v3
// @description  A script with the goal of enriching funda.nl and pararius.nl sites with information about the listing from official sources
// @author       David Parker
// @match        https://www.funda.nl/zoeken/huur/*
// @match        https://www.funda.nl/zoeken/koop/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=funda.nl
// @grant       GM.xmlhttpRequest
// @connect     www.ep-online.nl
// @connect     www.wozwaardeloket.nl
// ==/UserScript==

//switching stuff for old vs new funda
//https://stackoverflow.com/questions/48587922/using-the-same-userscript-to-run-different-code-at-different-urls

const labelColor = new Map([
  ['A+++', '#00A54E'],
  ['A++', '#4CB948'],
  ['A+', '#BFD72F'],
  ['A', '#FFF100'],
  ['B', '#FDB914'],
  ['C', '#F56E20'],
  ['D', "#EF1C22"],
  ['E', "#EF1C22"],
  ['F', "#EF1C22"],
  ['G', "#EF1C22"],
  [undefined, "#D8A3DD"],
]);


(async () => {

//debugger;
'use strict';

const eponline = 'https://www.ep-online.nl/Energylabel/Search'


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

function getTokenXhr(){
    return new Promise((resolve, reject) => {
        GM.xmlhttpRequest({
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
        GM.xmlhttpRequest({
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
  let searchResultBase = doc.querySelectorAll('[data-test-id="search-result-item"]')
  let results = Array.from(searchResultBase)
  .map(node=>{
    let address = extractAddress(node.querySelector('[data-test-id="street-name-house-number"]').textContent.trim());
    let postcode = extractPostcode(node.querySelector('[data-test-id="postal-code-city"]').textContent.trim());
    return {node, address, postcode};
  })
  return results;
}

function extractAddressNodesPromise(token){
  return new Promise((resolve, reject)=>{
      resolve({token:token, results:extractAddressNodes(document)}
    )})
}


// takes a node, parses it, and returns a string summary
function generateLabelSummary(node){
  if (node===undefined)
    return {text:"issue getting label", label:undefined}

  //get the letter label
  let label = node.querySelector('[class*=bg-label-class-] > span').innerText.trim()

  // check if label is valid
  let Opnamedatum = Array.from(node.querySelectorAll('.se-item-description-nta')).filter(x=> x.innerText.trim()==="Opnamedatum")[0].nextElementSibling.innerText.trim()
  if (Opnamedatum === "-"){
    return {text:"unofficial " + label, label:label}
  }

  //check if pre-2021 type label
  let energyIndex = Array.from(node.querySelectorAll('.se-item-description-nta')).filter(x=> x.innerText.trim()==="EI")
  if (!!energyIndex.length){
    return {text:"EnergyIndex: " + energyIndex[0].nextElementSibling.innerText.trim() + " (letter: "+label+")", label:label}
  }

  // return current energy label class
  return {text:"EnergyLabel: "+label, label:label}

}


function composeNodes(data){
  //add energy label
  data.filter(prom => prom.status === 'fulfilled').forEach((x) => {
//    debugger;
    let summary = generateLabelSummary(x.value.labelNode);
    let nodeToInsertAfter = x.value.node.querySelector('.flex-wrap.overflow-hidden')
    let p = document.createElement('p')
    p.textContent=summary.text
    p.style.backgroundColor = labelColor.get(summary.label)

    nodeToInsertAfter.after(p)
//    console.log(labelSummary)
//    x.value.node.append(labelSummary);
//    return x;
  })

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

const call = await getTokenXhr().then(extractTokenPromise).then(extractAddressNodesPromise).then(getLabels).then(composeNodes).then(console.log).catch((reason)=>console.log(reason))


})();