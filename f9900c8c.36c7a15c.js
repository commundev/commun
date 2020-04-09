(window.webpackJsonp=window.webpackJsonp||[]).push([[13],{115:function(e,t,n){"use strict";n.r(t),n.d(t,"frontMatter",(function(){return o})),n.d(t,"metadata",(function(){return c})),n.d(t,"rightToc",(function(){return u})),n.d(t,"default",(function(){return s}));var r=n(1),i=n(6),a=(n(0),n(118)),o={id:"entity-join-attributes",title:"Entity Join Attributes",sidebar_label:"Entity Join Attributes"},c={id:"entity-join-attributes",title:"Entity Join Attributes",description:"Entities can have a list of join attributes, which are useful for querying related items from any entity.",source:"@site/docs/entity-join-attributes.md",permalink:"/docs/entity-join-attributes",editUrl:"https://github.com/commundev/commun/edit/master/website/docs/entity-join-attributes.md",sidebar_label:"Entity Join Attributes",sidebar:"communSidebar",previous:{title:"Entity Attributes",permalink:"/docs/entity-attributes"}},u=[{value:"Query Type",id:"query-type",children:[]},{value:"Query",id:"query",children:[{value:"Static query values",id:"static-query-values",children:[]},{value:"Dynamic query values",id:"dynamic-query-values",children:[]}]},{value:"Example",id:"example",children:[]}],l={rightToc:u};function s(e){var t=e.components,n=Object(i.a)(e,["components"]);return Object(a.b)("wrapper",Object(r.a)({},l,n,{components:t,mdxType:"MDXLayout"}),Object(a.b)("p",null,"Entities can have a list of join attributes, which are useful for querying related items from any entity."),Object(a.b)("h2",{id:"query-type"},"Query Type"),Object(a.b)("ul",null,Object(a.b)("li",{parentName:"ul"},Object(a.b)("strong",{parentName:"li"},"Find One"),": The attribute value will be a single item queried from a specific entity."),Object(a.b)("li",{parentName:"ul"},Object(a.b)("strong",{parentName:"li"},"Find Many"),": The attribute value will be a list of items queried from a specific entity.")),Object(a.b)("h2",{id:"query"},"Query"),Object(a.b)("p",null,"A query is composed by a set of key-value conditions, where the keys are attributes from the selected entity.\nThe result of the query will be the item or items that match all the conditions. Each value can be static or dynamic."),Object(a.b)("h3",{id:"static-query-values"},"Static query values"),Object(a.b)("p",null,"Static values can be any string, number or boolean. The given value will be queried in the Entity Reference and only\nitems matching the exact value will conform to the condition."),Object(a.b)("h3",{id:"dynamic-query-values"},"Dynamic query values"),Object(a.b)("p",null,"Dynamic values can be used to query items based on information from the current item or the authenticated user.\nThese values are enclosed within ",Object(a.b)("inlineCode",{parentName:"p"},"{ }"),". The keyword ",Object(a.b)("inlineCode",{parentName:"p"},"this")," can be used to access data from the current item,\nfor example ",Object(a.b)("inlineCode",{parentName:"p"},"{this.id}")," will query for the ID of the current item.\nThe keyword ",Object(a.b)("inlineCode",{parentName:"p"},"user")," can be used to access data from the authenticated user, for example ",Object(a.b)("inlineCode",{parentName:"p"},"{user.id}"),"  will query for the\nvalue of the ID of the authenticated user."),Object(a.b)("h2",{id:"example"},"Example"),Object(a.b)("p",null,"Let's assume two entities: ",Object(a.b)("strong",{parentName:"p"},"Posts")," and ",Object(a.b)("strong",{parentName:"p"},"Likes"),". The requirement is to return whether the authenticated user liked or\nnot a given post. ",Object(a.b)("strong",{parentName:"p"},"Likes")," has two attributes: ",Object(a.b)("strong",{parentName:"p"},"post")," and ",Object(a.b)("strong",{parentName:"p"},"user")," which contain the IDs of the liked post and the\nuser who liked the post respectively."),Object(a.b)("p",null,"In order to solve this, we can create a join attribute on ",Object(a.b)("strong",{parentName:"p"},"Posts")," called ",Object(a.b)("strong",{parentName:"p"},"viewerLike")," which will query the\nrequired data. The join attribute settings will be:"),Object(a.b)("p",null,Object(a.b)("img",Object(r.a)({parentName:"p"},{src:"/img/docs-entity-join-attributes-1.png",alt:"Join Attribute Example"}))),Object(a.b)("p",null,"When fetching a post with the access token of an user who liked it, the post will include in the response a\n",Object(a.b)("strong",{parentName:"p"},"viewerLike")," attribute, which will contain the queried item from the Likes entity. "))}s.isMDXComponent=!0},118:function(e,t,n){"use strict";n.d(t,"a",(function(){return b})),n.d(t,"b",(function(){return m}));var r=n(0),i=n.n(r);function a(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function o(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),n.push.apply(n,r)}return n}function c(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{};t%2?o(Object(n),!0).forEach((function(t){a(e,t,n[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):o(Object(n)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))}))}return e}function u(e,t){if(null==e)return{};var n,r,i=function(e,t){if(null==e)return{};var n,r,i={},a=Object.keys(e);for(r=0;r<a.length;r++)n=a[r],t.indexOf(n)>=0||(i[n]=e[n]);return i}(e,t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);for(r=0;r<a.length;r++)n=a[r],t.indexOf(n)>=0||Object.prototype.propertyIsEnumerable.call(e,n)&&(i[n]=e[n])}return i}var l=i.a.createContext({}),s=function(e){var t=i.a.useContext(l),n=t;return e&&(n="function"==typeof e?e(t):c({},t,{},e)),n},b=function(e){var t=s(e.components);return i.a.createElement(l.Provider,{value:t},e.children)},p={inlineCode:"code",wrapper:function(e){var t=e.children;return i.a.createElement(i.a.Fragment,{},t)}},d=Object(r.forwardRef)((function(e,t){var n=e.components,r=e.mdxType,a=e.originalType,o=e.parentName,l=u(e,["components","mdxType","originalType","parentName"]),b=s(n),d=r,m=b["".concat(o,".").concat(d)]||b[d]||p[d]||a;return n?i.a.createElement(m,c({ref:t},l,{components:n})):i.a.createElement(m,c({ref:t},l))}));function m(e,t){var n=arguments,r=t&&t.mdxType;if("string"==typeof e||r){var a=n.length,o=new Array(a);o[0]=d;var c={};for(var u in t)hasOwnProperty.call(t,u)&&(c[u]=t[u]);c.originalType=e,c.mdxType="string"==typeof e?e:r,o[1]=c;for(var l=2;l<a;l++)o[l]=n[l];return i.a.createElement.apply(null,o)}return i.a.createElement.apply(null,n)}d.displayName="MDXCreateElement"}}]);