import{j as n}from"./jsx-runtime-D_zvdyIk.js";import{c as t}from"./cn-CIsb_jhR.js";import{C as P}from"./chevron-left-ghOawqgm.js";import{c as h}from"./createLucideIcon-D7R0JOl0.js";import{C as u}from"./chevron-right-fIHCD1gy.js";import"./clsx-B-dksMZM.js";import"./index-CGj_12n1.js";/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["circle",{cx:"12",cy:"12",r:"1",key:"41hilf"}],["circle",{cx:"19",cy:"12",r:"1",key:"1wjl8i"}],["circle",{cx:"5",cy:"12",r:"1",key:"1pcz8c"}]],N=h("ellipsis",j);function r({className:i,...e}){return n.jsx("nav",{role:"navigation","aria-label":"pagination",className:t("mx-auto flex w-full justify-center",i),...e})}function d({className:i,...e}){return n.jsx("ul",{className:t("flex flex-row items-center gap-1",i),...e})}function a({className:i,...e}){return n.jsx("li",{className:t("",i),...e})}function o({className:i,isActive:e,...f}){return n.jsx("a",{className:t("inline-flex size-9 items-center justify-center rounded-md border bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground",e&&"border-primary text-primary",i),...f})}function g({className:i,...e}){return n.jsxs(o,{className:t("gap-1 pl-2 pr-3",i),...e,children:[n.jsx(P,{className:"size-4"}),n.jsx("span",{children:"Previous"})]})}function p({className:i,...e}){return n.jsxs(o,{className:t("gap-1 pl-3 pr-2",i),...e,children:[n.jsx("span",{children:"Next"}),n.jsx(u,{className:"size-4"})]})}function x({className:i,...e}){return n.jsxs("span",{role:"presentation","aria-hidden":!0,className:t("inline-flex size-9 items-center justify-center",i),...e,children:[n.jsx(N,{className:"size-4"}),n.jsx("span",{className:"sr-only",children:"More pages"})]})}r.__docgenInfo={description:"",methods:[],displayName:"Pagination"};d.__docgenInfo={description:"",methods:[],displayName:"PaginationContent"};a.__docgenInfo={description:"",methods:[],displayName:"PaginationItem"};o.__docgenInfo={description:"",methods:[],displayName:"PaginationLink",props:{isActive:{required:!1,tsType:{name:"boolean"},description:""}}};g.__docgenInfo={description:"",methods:[],displayName:"PaginationPrevious"};p.__docgenInfo={description:"",methods:[],displayName:"PaginationNext"};x.__docgenInfo={description:"",methods:[],displayName:"PaginationEllipsis"};const b={title:"Components/Pagination",component:r},s={render:()=>n.jsx(r,{children:n.jsxs(d,{children:[n.jsx(a,{children:n.jsx(g,{href:"#"})}),n.jsx(a,{children:n.jsx(o,{href:"#",children:"1"})}),n.jsx(a,{children:n.jsx(o,{href:"#",isActive:!0,children:"2"})}),n.jsx(a,{children:n.jsx(o,{href:"#",children:"3"})}),n.jsx(a,{children:n.jsx(x,{})}),n.jsx(a,{children:n.jsx(p,{href:"#"})})]})})};var c,l,m;s.parameters={...s.parameters,docs:{...(c=s.parameters)==null?void 0:c.docs,source:{originalSource:`{
  render: () => <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
}`,...(m=(l=s.parameters)==null?void 0:l.docs)==null?void 0:m.source}}};const z=["Basic"];export{s as Basic,z as __namedExportsOrder,b as default};
