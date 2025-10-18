import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{c as n}from"./cn-CIsb_jhR.js";import{c as B}from"./createLucideIcon-D7R0JOl0.js";import"./clsx-B-dksMZM.js";import"./index-CGj_12n1.js";/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M22 2 2 22",key:"y4kqgn"}]],x=B("slash",f);function m({className:r,...a}){return e.jsx("nav",{"aria-label":"breadcrumb",className:n("w-full",r),...a})}function l({className:r,...a}){return e.jsx("ol",{className:n("flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground",r),...a})}function t({className:r,...a}){return e.jsx("li",{className:n("inline-flex items-center gap-1",r),...a})}function s({className:r,...a}){return e.jsx("a",{className:n("transition-colors hover:text-foreground",r),...a})}function p({className:r,...a}){return e.jsx("span",{"aria-current":"page",className:n("font-medium text-foreground",r),...a})}function d({className:r,children:a,...b}){return e.jsx("span",{role:"presentation","aria-hidden":!0,className:n("text-muted-foreground/60",r),...b,children:a??e.jsx(x,{className:"size-3.5"})})}m.__docgenInfo={description:"",methods:[],displayName:"Breadcrumb"};l.__docgenInfo={description:"",methods:[],displayName:"BreadcrumbList"};t.__docgenInfo={description:"",methods:[],displayName:"BreadcrumbItem"};s.__docgenInfo={description:"",methods:[],displayName:"BreadcrumbLink"};p.__docgenInfo={description:"",methods:[],displayName:"BreadcrumbPage"};d.__docgenInfo={description:"",methods:[],displayName:"BreadcrumbSeparator"};const N={title:"Components/Breadcrumb",component:m},c={render:()=>e.jsx(m,{children:e.jsxs(l,{children:[e.jsx(t,{children:e.jsx(s,{href:"#",children:"Home"})}),e.jsx(d,{}),e.jsx(t,{children:e.jsx(s,{href:"#",children:"Library"})}),e.jsx(d,{}),e.jsx(t,{children:e.jsx(p,{children:"Data"})})]})})};var o,i,u;c.parameters={...c.parameters,docs:{...(o=c.parameters)==null?void 0:o.docs,source:{originalSource:`{
  render: () => <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Library</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Data</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
}`,...(u=(i=c.parameters)==null?void 0:i.docs)==null?void 0:u.source}}};const L=["Basic"];export{c as Basic,L as __namedExportsOrder,N as default};
