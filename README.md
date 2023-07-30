# neux

A frontend microlibrary with reactivity states and views.

## State

The state is a proxy for objects. States are used to track changes and distribute them to related views and other state fields.

```js
const state = createState({
  counter: 1,
  multiplier: 2,
  tasks: [
    { text: 'Item 1' },
    { text: 'Item 2', checked: true }
  ],
  // the calculated field for an object
  double: (obj, prop) => obj.$counter * 2,
  // the calculated field for an array
  filtered: (obj, prop) => {
    return obj.$tasks.filter(item => item.checked);
  }
});
// set or change the calculated field
state.double = (obj, prop) => state.$double * state.$multiplier;
// delete specified field with all listeners
delete state.double;
```

> **Attention!**
>
> 1. When deleting or replacing the tracking object/array in the calculated field, all binding is lost.
> 2. In calculated fields, binding occurs only with those fields that are called during initialization.

Watching for state changes

```js
const handler = (newv, prop, obj) => {
  const oldv = obj[prop];
  console.log(newv, oldv, prop, obj);
};
// add a specified listener
state.$$on('double', handler);
// add a specified listener that only calls once
state.$$once('double', handler);
// remove a specified listener
state.$$off('double', handler);
// remove all listeners for the specified field
state.$$off('double');
// add a listener to watch any changes
// on this object and all children
state.tasks.$$on('*', handler);
```

## Sync

State synchronization is used to save their data to persistent storage.

Synchronizing state with `localStorage`:

```js
const syncer = (newv, oldv, diff) => {
  if (!oldv) {
    return JSON.parse(localStorage.getItem('todos') || '[]');
  } else {
    localStorage.setItem('todos', JSON.stringify(newv));
  }
  return newv;
};
// create a synchronization with state
// slippage (in ms) helps group and reduce call frequency
const sync = createSync(state.tasks, syncer, { slippage: 100 });
// sync state with local storage
sync();
```

Synchronizing state with remote store:

```js
const syncer = async (newv, oldv, diff) => {
  const res = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diff || {})
  });
  return await res.json();
};
// create a synchronization with state
const sync = createSync(state.tasks, syncer);
// sync state with remote store
sync();
```

Undo last changes or clear:

```js
const syncer = (newv, oldv, diff, action) => {
  if (action === 'undo') return oldv;
  if (action === 'clear') return [];
  return newv;
};
// create a synchronization with state
const sync = createSync(state.tasks, syncer);
// commit current state
sync();
// change state
state.tasks[0].checked = true;
// commit changes
sync();
// change state again
state.tasks[0].checked = false;
// undo last change
sync('undo');
// delete all data
sync('clear');
```

## View

A view is a declarative description of DOM elements.

```js
const state = createState({
  list: [
    { text: 'Item 1'},
    { text: 'Item 2', checked: true },
    { text: 'Item 3' }
  ]
});
createView({
  children: [{
    tagName: 'h1',
    textContent: 'To Do'
  }, {
    tagName: 'input',
    placeholder: 'Enter your task...',
    autofocus: true,
    on: {
      keyup: (e) => {
        if (e.keyCode === 13) {
          e.preventDefault();
          state.list.push({ text: e.target.value });
          e.target.value = '';
        }
      },
    }
  }, {
    tagName: 'div',
    children: [{
      tagName: 'input',
      type: 'checkbox',
      on: {
        change: (e) => {
          const checked = e.target.checked;
          state.list.forEach((item) => {
            item.checked = checked;
          });
        }
      }
    }, {
      tagName: 'label',
      textContent: 'Mark all as complete'
    }]
  }, {
    tagName: 'ul',
    children: () => {
      // redraw the list if any child element is added, replaced or removed
      // any updates inside children are ignored
      return state.list.$$each(item => {
        return {
          tagName: 'li',
          on: {
            mounted: () => console.log('mounted', item),
            removed: () => console.log('removed', item)
          },
          children: [{
            tagName: 'input',
            type: 'checkbox',
            checked: () => item.$checked,
            on: {
              change: (e) => {
                item.checked = e.target.checked;
              }
            }
          }, {
            tagName: 'label',
            textContent: () => item.$text
          }, {
            tagName: 'a',
            href: '#',
            textContent: '[x]',
            on: {
              click: (e) => {
                e.preventDefault();
                const index = state.list.indexOf(item);
                state.list.splice(index, 1);
              }
            }
          }]
        };
      });
    }
  }, {
    textContent: () => `Total items: ${state.list.$length}`
  }]
}, document.body);
```

## Component

You can wrap part of the view into a separate component. This is a simple function that returns the markup of a view. To use such a component, you need to pass this function in the "view" parameter.

```js
const Header = (params) => {
  return {
    tagName: 'header',
    children: [{
      tagName: 'strong',
      textContent: params.text
    }]
  };
};
createView({
  children: [{
    // create view from function
    view: Header,
    text: 'Welcome!'
  }, {
    // create view from HTML markup
    view: '<main><p>My content</p></main>',
    style: {
      color: 'red'
    }
  }, {
    // create view from HTMLElement
    view: document.createElement('footer'),
    textContent: 'Powered by Neux'
  }]
}, document.body);
```

## Localization

Localization is used to display the application interface in different languages.

```js
const l10n = createL10n({
  locales: {
    en: {
      say: {
        hello: "Hello %{name}!"
      }
    },
    ru: {
      say: {
        hello: "Привет %{name}!"
      }
    }
  },
  fallback: 'en',
  lang: navigator.language
});
const msg = l10n.t('say.hello', { name: 'World' }, 'en');
console.log(msg); // Hello World!
l10n.lang = 'en';
const msgEn = l10n.t('say.hello', { name: 'World' });
console.log(msgEn); // Hello World!
l10n.lang = 'ru';
const msgRu = l10n.t('say.hello', { name: 'Мир' });
console.log(msgRu); // Привет Мир!
```

## Routing

Routing is used to link separate states or pages of a web application to the address bar in the browser.

```js
const router = createRouter({
  home: 'page1'
});
createView({
  children: [{
    children: [{
      tagName: 'a',
      href: '#page1',
      textContent: 'Page 1'
    }, {
      tagName: 'a',
      href: '#page2?param1=1',
      textContent: 'Page 2'
    }, {
      tagName: 'button',
      textContent: 'Page 3',
      on: {
        click: () => {
          router.navigate('page3', { param1: '1', param2: '2' });
        }
      }
    }]
  }, {
    children: () => {
      switch (router.$path) {
      case 'page1':
        return [{
          tagName: 'p',
          textContent: 'Page 1'
        }];
      case 'page2':
        return [{
          tagName: 'p',
          textContent: 'Page 2'
        }];
      case 'page3':
        return [{
          tagName: 'p',
          textContent: 'Page 3'
        }];
      default:
        return [{
          tagName: 'p',
          textContent: 'Not found'
        }];
      }
    }
  }, {
    textContent: () => `Path: ${router.$path} , Params: ${JSON.stringify(router.$params)}`
  }]
}, document.body);
```

## RPC

RPC is short for Remote Procedure Call. This abstraction allows you to execute code on the backend by calling normal functions on the frontend.

Here is an example of calling some function:

```js
// create RPC client
const rpc = createRPC({ url: '/api/rpc' });
// define input parameters
const text = 'Text'; // as text
const object = { text }; // as object
const blob = new Blob([text]); // as blob
const file = new File([blob], 'file.txt'); // as file
const formData = new FormData(); // as form-data
formData.append('file', file);
// call the remote function named "hello"
const response = await rpc.hello(/* params */);
console.log(response);
```

The function can accept input parameters in the formats `String`, `Object`, `Blob`, `File` or `FormData`. The function response can be one of three types `String`, `Object` or `Blob`.

The default backend request HTTP method is `POST`. The API address on the backend has the format `/api/rpc/:method`, where `:method` is the name of the function to run.

The request can be of the following types:

- `application/json` - format for passing JavaScript objects.
- `multipart/from-data` - file transfer format.
- `text/plain` - all non-objects are passed as text.

The response need be of the following types:

- `application/json` - format for passing JavaScript objects.
- `application/octet-stream` - file transfer format.
- `text/plain` - all non-objects are passed as text.

Below is an example of using RPC for some imaginary backend:

```js
let token = '';
// create RPC client
const rpc = createRPC({
  // RPC backend endpoint
  url: '/api/rpc',
  // include headers for every request
  headers: {
    // getter for authorization header
    get Authorization() {
      return token && `Bearer ${token}`;
    }
  },
  // include cookies for every request
  // credentials: 'include',
  // enable CORS for requests
  // mode: 'cors'
});
// authorize and get the session token
token = await rpc.login({ username, password });
// upload file from <input id="file" type="file" />
const file = document.getElementById('file').files[0];
const { id, name, type, size } = await rpc.upload(file);
// send json data
const res = await rpc.addComment({
  author: 'John Doe',
  text: 'Hello World!',
  time: new Date(),
  attachments: [id]
});
// update data
await rpc.updateComment({
  id: res.id,
  text: 'Edited message'
});
// receive json data
const comment = await rpc.getComment({
  id: res.id
});
```

## To do

- [x] State
- [x] View
- [x] L10n
- [x] Router
- [x] View components
- [x] State synchronization
- [x] RPC
- [ ] Pagination
- [ ] Real-time state sync
- [ ] P2P state sync
