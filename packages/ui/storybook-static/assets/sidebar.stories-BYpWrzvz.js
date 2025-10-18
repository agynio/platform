import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{c as i}from"./cn-CIsb_jhR.js";import"./clsx-B-dksMZM.js";function t({className:r,...n}){return e.jsx("div",{className:i("flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground",r),...n})}function b({className:r,...n}){return e.jsx("div",{className:i("flex items-center gap-2 border-b px-4 py-3",r),...n})}function p({className:r,...n}){return e.jsx("div",{className:i("mt-auto border-t px-4 py-3",r),...n})}function l({className:r,...n}){return e.jsx("div",{className:i("flex-1 overflow-auto px-2 py-2",r),...n})}function m({className:r,...n}){return e.jsx("div",{className:i("px-2 py-2",r),...n})}function S({className:r,...n}){return e.jsx("div",{className:i("px-2 py-1 text-xs font-medium text-muted-foreground",r),...n})}function x({className:r,...n}){return e.jsx("div",{className:i("mt-1 space-y-1",r),...n})}function f({className:r,...n}){return e.jsx("ul",{className:i("flex flex-col gap-1",r),...n})}function o({className:r,...n}){return e.jsx("li",{className:i("",r),...n})}function a({className:r,isActive:n,...h}){return e.jsx("button",{className:i("inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",n&&"bg-sidebar-accent text-sidebar-accent-foreground",r),...h})}t.__docgenInfo={description:"",methods:[],displayName:"Sidebar"};b.__docgenInfo={description:"",methods:[],displayName:"SidebarHeader"};p.__docgenInfo={description:"",methods:[],displayName:"SidebarFooter"};l.__docgenInfo={description:"",methods:[],displayName:"SidebarContent"};m.__docgenInfo={description:"",methods:[],displayName:"SidebarGroup"};S.__docgenInfo={description:"",methods:[],displayName:"SidebarGroupLabel"};x.__docgenInfo={description:"",methods:[],displayName:"SidebarGroupContent"};f.__docgenInfo={description:"",methods:[],displayName:"SidebarMenu"};o.__docgenInfo={description:"",methods:[],displayName:"SidebarMenuItem"};a.__docgenInfo={description:"",methods:[],displayName:"SidebarMenuButton",props:{isActive:{required:!1,tsType:{name:"boolean"},description:""}}};const _={title:"Components/Sidebar",component:t},d={render:()=>e.jsx("div",{className:"h-64 border",children:e.jsxs(t,{children:[e.jsx(b,{children:"Header"}),e.jsx(l,{children:e.jsxs(m,{children:[e.jsx(S,{children:"Group"}),e.jsx(x,{children:e.jsxs(f,{children:[e.jsx(o,{children:e.jsx(a,{isActive:!0,children:"Dashboard"})}),e.jsx(o,{children:e.jsx(a,{children:"Settings"})})]})})]})}),e.jsx(p,{children:"Footer"})]})})};var s,c,u;d.parameters={...d.parameters,docs:{...(s=d.parameters)==null?void 0:s.docs,source:{originalSource:`{
  render: () => <div className="h-64 border">
      <Sidebar>
        <SidebarHeader>Header</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Group</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>Dashboard</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Settings</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>Footer</SidebarFooter>
      </Sidebar>
    </div>
}`,...(u=(c=d.parameters)==null?void 0:c.docs)==null?void 0:u.source}}};const v=["Basic"];export{d as Basic,v as __namedExportsOrder,_ as default};
