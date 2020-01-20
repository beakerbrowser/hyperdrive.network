var main = (function (exports) {
    'use strict';

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const directives = new WeakMap();
    /**
     * Brands a function as a directive so that lit-html will call the function
     * during template rendering, rather than passing as a value.
     *
     * @param f The directive factory function. Must be a function that returns a
     * function of the signature `(part: Part) => void`. The returned function will
     * be called with the part object
     *
     * @example
     *
     * ```
     * import {directive, html} from 'lit-html';
     *
     * const immutable = directive((v) => (part) => {
     *   if (part.value !== v) {
     *     part.setValue(v)
     *   }
     * });
     * ```
     */
    // tslint:disable-next-line:no-any
    const directive = (f) => ((...args) => {
        const d = f(...args);
        directives.set(d, true);
        return d;
    });
    const isDirective = (o) => {
        return typeof o === 'function' && directives.has(o);
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * True if the custom elements polyfill is in use.
     */
    const isCEPolyfill = window.customElements !== undefined &&
        window.customElements.polyfillWrapFlushCallback !==
            undefined;
    /**
     * Reparents nodes, starting from `startNode` (inclusive) to `endNode`
     * (exclusive), into another container (could be the same container), before
     * `beforeNode`. If `beforeNode` is null, it appends the nodes to the
     * container.
     */
    const reparentNodes = (container, start, end = null, before = null) => {
        let node = start;
        while (node !== end) {
            const n = node.nextSibling;
            container.insertBefore(node, before);
            node = n;
        }
    };
    /**
     * Removes nodes, starting from `startNode` (inclusive) to `endNode`
     * (exclusive), from `container`.
     */
    const removeNodes = (container, startNode, endNode = null) => {
        let node = startNode;
        while (node !== endNode) {
            const n = node.nextSibling;
            container.removeChild(node);
            node = n;
        }
    };

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * A sentinel value that signals that a value was handled by a directive and
     * should not be written to the DOM.
     */
    const noChange = {};
    /**
     * A sentinel value that signals a NodePart to fully clear its content.
     */
    const nothing = {};

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * An expression marker with embedded unique key to avoid collision with
     * possible text in templates.
     */
    const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
    /**
     * An expression marker used text-positions, multi-binding attributes, and
     * attributes with markup-like text values.
     */
    const nodeMarker = `<!--${marker}-->`;
    const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
    /**
     * Suffix appended to all bound attribute names.
     */
    const boundAttributeSuffix = '$lit$';
    /**
     * An updateable Template that tracks the location of dynamic parts.
     */
    class Template {
        constructor(result, element) {
            this.parts = [];
            this.element = element;
            let index = -1;
            let partIndex = 0;
            const nodesToRemove = [];
            const _prepareTemplate = (template) => {
                const content = template.content;
                // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be
                // null
                const walker = document.createTreeWalker(content, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
                // Keeps track of the last index associated with a part. We try to delete
                // unnecessary nodes, but we never want to associate two different parts
                // to the same index. They must have a constant node between.
                let lastPartIndex = 0;
                while (walker.nextNode()) {
                    index++;
                    const node = walker.currentNode;
                    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                        if (node.hasAttributes()) {
                            const attributes = node.attributes;
                            // Per
                            // https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                            // attributes are not guaranteed to be returned in document order.
                            // In particular, Edge/IE can return them out of order, so we cannot
                            // assume a correspondance between part index and attribute index.
                            let count = 0;
                            for (let i = 0; i < attributes.length; i++) {
                                if (attributes[i].value.indexOf(marker) >= 0) {
                                    count++;
                                }
                            }
                            while (count-- > 0) {
                                // Get the template literal section leading up to the first
                                // expression in this attribute
                                const stringForPart = result.strings[partIndex];
                                // Find the attribute name
                                const name = lastAttributeNameRegex.exec(stringForPart)[2];
                                // Find the corresponding attribute
                                // All bound attributes have had a suffix added in
                                // TemplateResult#getHTML to opt out of special attribute
                                // handling. To look up the attribute value we also need to add
                                // the suffix.
                                const attributeLookupName = name.toLowerCase() + boundAttributeSuffix;
                                const attributeValue = node.getAttribute(attributeLookupName);
                                const strings = attributeValue.split(markerRegex);
                                this.parts.push({ type: 'attribute', index, name, strings });
                                node.removeAttribute(attributeLookupName);
                                partIndex += strings.length - 1;
                            }
                        }
                        if (node.tagName === 'TEMPLATE') {
                            _prepareTemplate(node);
                        }
                    }
                    else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                        const data = node.data;
                        if (data.indexOf(marker) >= 0) {
                            const parent = node.parentNode;
                            const strings = data.split(markerRegex);
                            const lastIndex = strings.length - 1;
                            // Generate a new text node for each literal section
                            // These nodes are also used as the markers for node parts
                            for (let i = 0; i < lastIndex; i++) {
                                parent.insertBefore((strings[i] === '') ? createMarker() :
                                    document.createTextNode(strings[i]), node);
                                this.parts.push({ type: 'node', index: ++index });
                            }
                            // If there's no text, we must insert a comment to mark our place.
                            // Else, we can trust it will stick around after cloning.
                            if (strings[lastIndex] === '') {
                                parent.insertBefore(createMarker(), node);
                                nodesToRemove.push(node);
                            }
                            else {
                                node.data = strings[lastIndex];
                            }
                            // We have a part for each match found
                            partIndex += lastIndex;
                        }
                    }
                    else if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
                        if (node.data === marker) {
                            const parent = node.parentNode;
                            // Add a new marker node to be the startNode of the Part if any of
                            // the following are true:
                            //  * We don't have a previousSibling
                            //  * The previousSibling is already the start of a previous part
                            if (node.previousSibling === null || index === lastPartIndex) {
                                index++;
                                parent.insertBefore(createMarker(), node);
                            }
                            lastPartIndex = index;
                            this.parts.push({ type: 'node', index });
                            // If we don't have a nextSibling, keep this node so we have an end.
                            // Else, we can remove it to save future costs.
                            if (node.nextSibling === null) {
                                node.data = '';
                            }
                            else {
                                nodesToRemove.push(node);
                                index--;
                            }
                            partIndex++;
                        }
                        else {
                            let i = -1;
                            while ((i = node.data.indexOf(marker, i + 1)) !==
                                -1) {
                                // Comment node has a binding marker inside, make an inactive part
                                // The binding won't work, but subsequent bindings will
                                // TODO (justinfagnani): consider whether it's even worth it to
                                // make bindings in comments work
                                this.parts.push({ type: 'node', index: -1 });
                            }
                        }
                    }
                }
            };
            _prepareTemplate(element);
            // Remove text binding nodes after the walk to not disturb the TreeWalker
            for (const n of nodesToRemove) {
                n.parentNode.removeChild(n);
            }
        }
    }
    const isTemplatePartActive = (part) => part.index !== -1;
    // Allows `document.createComment('')` to be renamed for a
    // small manual size-savings.
    const createMarker = () => document.createComment('');
    /**
     * This regex extracts the attribute name preceding an attribute-position
     * expression. It does this by matching the syntax allowed for attributes
     * against the string literal directly preceding the expression, assuming that
     * the expression is in an attribute-value position.
     *
     * See attributes in the HTML spec:
     * https://www.w3.org/TR/html5/syntax.html#attributes-0
     *
     * "\0-\x1F\x7F-\x9F" are Unicode control characters
     *
     * " \x09\x0a\x0c\x0d" are HTML space characters:
     * https://www.w3.org/TR/html5/infrastructure.html#space-character
     *
     * So an attribute is:
     *  * The name: any character except a control character, space character, ('),
     *    ("), ">", "=", or "/"
     *  * Followed by zero or more space characters
     *  * Followed by "="
     *  * Followed by zero or more space characters
     *  * Followed by:
     *    * Any character except space, ('), ("), "<", ">", "=", (`), or
     *    * (") then any non-("), or
     *    * (') then any non-(')
     */
    const lastAttributeNameRegex = /([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F \x09\x0a\x0c\x0d"'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * An instance of a `Template` that can be attached to the DOM and updated
     * with new values.
     */
    class TemplateInstance {
        constructor(template, processor, options) {
            this._parts = [];
            this.template = template;
            this.processor = processor;
            this.options = options;
        }
        update(values) {
            let i = 0;
            for (const part of this._parts) {
                if (part !== undefined) {
                    part.setValue(values[i]);
                }
                i++;
            }
            for (const part of this._parts) {
                if (part !== undefined) {
                    part.commit();
                }
            }
        }
        _clone() {
            // When using the Custom Elements polyfill, clone the node, rather than
            // importing it, to keep the fragment in the template's document. This
            // leaves the fragment inert so custom elements won't upgrade and
            // potentially modify their contents by creating a polyfilled ShadowRoot
            // while we traverse the tree.
            const fragment = isCEPolyfill ?
                this.template.element.content.cloneNode(true) :
                document.importNode(this.template.element.content, true);
            const parts = this.template.parts;
            let partIndex = 0;
            let nodeIndex = 0;
            const _prepareInstance = (fragment) => {
                // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be
                // null
                const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
                let node = walker.nextNode();
                // Loop through all the nodes and parts of a template
                while (partIndex < parts.length && node !== null) {
                    const part = parts[partIndex];
                    // Consecutive Parts may have the same node index, in the case of
                    // multiple bound attributes on an element. So each iteration we either
                    // increment the nodeIndex, if we aren't on a node with a part, or the
                    // partIndex if we are. By not incrementing the nodeIndex when we find a
                    // part, we allow for the next part to be associated with the current
                    // node if neccessasry.
                    if (!isTemplatePartActive(part)) {
                        this._parts.push(undefined);
                        partIndex++;
                    }
                    else if (nodeIndex === part.index) {
                        if (part.type === 'node') {
                            const part = this.processor.handleTextExpression(this.options);
                            part.insertAfterNode(node.previousSibling);
                            this._parts.push(part);
                        }
                        else {
                            this._parts.push(...this.processor.handleAttributeExpressions(node, part.name, part.strings, this.options));
                        }
                        partIndex++;
                    }
                    else {
                        nodeIndex++;
                        if (node.nodeName === 'TEMPLATE') {
                            _prepareInstance(node.content);
                        }
                        node = walker.nextNode();
                    }
                }
            };
            _prepareInstance(fragment);
            if (isCEPolyfill) {
                document.adoptNode(fragment);
                customElements.upgrade(fragment);
            }
            return fragment;
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * The return type of `html`, which holds a Template and the values from
     * interpolated expressions.
     */
    class TemplateResult {
        constructor(strings, values, type, processor) {
            this.strings = strings;
            this.values = values;
            this.type = type;
            this.processor = processor;
        }
        /**
         * Returns a string of HTML used to create a `<template>` element.
         */
        getHTML() {
            const endIndex = this.strings.length - 1;
            let html = '';
            for (let i = 0; i < endIndex; i++) {
                const s = this.strings[i];
                // This exec() call does two things:
                // 1) Appends a suffix to the bound attribute name to opt out of special
                // attribute value parsing that IE11 and Edge do, like for style and
                // many SVG attributes. The Template class also appends the same suffix
                // when looking up attributes to create Parts.
                // 2) Adds an unquoted-attribute-safe marker for the first expression in
                // an attribute. Subsequent attribute expressions will use node markers,
                // and this is safe since attributes with multiple expressions are
                // guaranteed to be quoted.
                const match = lastAttributeNameRegex.exec(s);
                if (match) {
                    // We're starting a new bound attribute.
                    // Add the safe attribute suffix, and use unquoted-attribute-safe
                    // marker.
                    html += s.substr(0, match.index) + match[1] + match[2] +
                        boundAttributeSuffix + match[3] + marker;
                }
                else {
                    // We're either in a bound node, or trailing bound attribute.
                    // Either way, nodeMarker is safe to use.
                    html += s + nodeMarker;
                }
            }
            return html + this.strings[endIndex];
        }
        getTemplateElement() {
            const template = document.createElement('template');
            template.innerHTML = this.getHTML();
            return template;
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const isPrimitive = (value) => {
        return (value === null ||
            !(typeof value === 'object' || typeof value === 'function'));
    };
    /**
     * Sets attribute values for AttributeParts, so that the value is only set once
     * even if there are multiple parts for an attribute.
     */
    class AttributeCommitter {
        constructor(element, name, strings) {
            this.dirty = true;
            this.element = element;
            this.name = name;
            this.strings = strings;
            this.parts = [];
            for (let i = 0; i < strings.length - 1; i++) {
                this.parts[i] = this._createPart();
            }
        }
        /**
         * Creates a single part. Override this to create a differnt type of part.
         */
        _createPart() {
            return new AttributePart(this);
        }
        _getValue() {
            const strings = this.strings;
            const l = strings.length - 1;
            let text = '';
            for (let i = 0; i < l; i++) {
                text += strings[i];
                const part = this.parts[i];
                if (part !== undefined) {
                    const v = part.value;
                    if (v != null &&
                        (Array.isArray(v) ||
                            // tslint:disable-next-line:no-any
                            typeof v !== 'string' && v[Symbol.iterator])) {
                        for (const t of v) {
                            text += typeof t === 'string' ? t : String(t);
                        }
                    }
                    else {
                        text += typeof v === 'string' ? v : String(v);
                    }
                }
            }
            text += strings[l];
            return text;
        }
        commit() {
            if (this.dirty) {
                this.dirty = false;
                this.element.setAttribute(this.name, this._getValue());
            }
        }
    }
    class AttributePart {
        constructor(comitter) {
            this.value = undefined;
            this.committer = comitter;
        }
        setValue(value) {
            if (value !== noChange && (!isPrimitive(value) || value !== this.value)) {
                this.value = value;
                // If the value is a not a directive, dirty the committer so that it'll
                // call setAttribute. If the value is a directive, it'll dirty the
                // committer if it calls setValue().
                if (!isDirective(value)) {
                    this.committer.dirty = true;
                }
            }
        }
        commit() {
            while (isDirective(this.value)) {
                const directive = this.value;
                this.value = noChange;
                directive(this);
            }
            if (this.value === noChange) {
                return;
            }
            this.committer.commit();
        }
    }
    class NodePart {
        constructor(options) {
            this.value = undefined;
            this._pendingValue = undefined;
            this.options = options;
        }
        /**
         * Inserts this part into a container.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        appendInto(container) {
            this.startNode = container.appendChild(createMarker());
            this.endNode = container.appendChild(createMarker());
        }
        /**
         * Inserts this part between `ref` and `ref`'s next sibling. Both `ref` and
         * its next sibling must be static, unchanging nodes such as those that appear
         * in a literal section of a template.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        insertAfterNode(ref) {
            this.startNode = ref;
            this.endNode = ref.nextSibling;
        }
        /**
         * Appends this part into a parent part.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        appendIntoPart(part) {
            part._insert(this.startNode = createMarker());
            part._insert(this.endNode = createMarker());
        }
        /**
         * Appends this part after `ref`
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        insertAfterPart(ref) {
            ref._insert(this.startNode = createMarker());
            this.endNode = ref.endNode;
            ref.endNode = this.startNode;
        }
        setValue(value) {
            this._pendingValue = value;
        }
        commit() {
            while (isDirective(this._pendingValue)) {
                const directive = this._pendingValue;
                this._pendingValue = noChange;
                directive(this);
            }
            const value = this._pendingValue;
            if (value === noChange) {
                return;
            }
            if (isPrimitive(value)) {
                if (value !== this.value) {
                    this._commitText(value);
                }
            }
            else if (value instanceof TemplateResult) {
                this._commitTemplateResult(value);
            }
            else if (value instanceof Node) {
                this._commitNode(value);
            }
            else if (Array.isArray(value) ||
                // tslint:disable-next-line:no-any
                value[Symbol.iterator]) {
                this._commitIterable(value);
            }
            else if (value === nothing) {
                this.value = nothing;
                this.clear();
            }
            else {
                // Fallback, will render the string representation
                this._commitText(value);
            }
        }
        _insert(node) {
            this.endNode.parentNode.insertBefore(node, this.endNode);
        }
        _commitNode(value) {
            if (this.value === value) {
                return;
            }
            this.clear();
            this._insert(value);
            this.value = value;
        }
        _commitText(value) {
            const node = this.startNode.nextSibling;
            value = value == null ? '' : value;
            if (node === this.endNode.previousSibling &&
                node.nodeType === 3 /* Node.TEXT_NODE */) {
                // If we only have a single text node between the markers, we can just
                // set its value, rather than replacing it.
                // TODO(justinfagnani): Can we just check if this.value is primitive?
                node.data = value;
            }
            else {
                this._commitNode(document.createTextNode(typeof value === 'string' ? value : String(value)));
            }
            this.value = value;
        }
        _commitTemplateResult(value) {
            const template = this.options.templateFactory(value);
            if (this.value instanceof TemplateInstance &&
                this.value.template === template) {
                this.value.update(value.values);
            }
            else {
                // Make sure we propagate the template processor from the TemplateResult
                // so that we use its syntax extension, etc. The template factory comes
                // from the render function options so that it can control template
                // caching and preprocessing.
                const instance = new TemplateInstance(template, value.processor, this.options);
                const fragment = instance._clone();
                instance.update(value.values);
                this._commitNode(fragment);
                this.value = instance;
            }
        }
        _commitIterable(value) {
            // For an Iterable, we create a new InstancePart per item, then set its
            // value to the item. This is a little bit of overhead for every item in
            // an Iterable, but it lets us recurse easily and efficiently update Arrays
            // of TemplateResults that will be commonly returned from expressions like:
            // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
            // If _value is an array, then the previous render was of an
            // iterable and _value will contain the NodeParts from the previous
            // render. If _value is not an array, clear this part and make a new
            // array for NodeParts.
            if (!Array.isArray(this.value)) {
                this.value = [];
                this.clear();
            }
            // Lets us keep track of how many items we stamped so we can clear leftover
            // items from a previous render
            const itemParts = this.value;
            let partIndex = 0;
            let itemPart;
            for (const item of value) {
                // Try to reuse an existing part
                itemPart = itemParts[partIndex];
                // If no existing part, create a new one
                if (itemPart === undefined) {
                    itemPart = new NodePart(this.options);
                    itemParts.push(itemPart);
                    if (partIndex === 0) {
                        itemPart.appendIntoPart(this);
                    }
                    else {
                        itemPart.insertAfterPart(itemParts[partIndex - 1]);
                    }
                }
                itemPart.setValue(item);
                itemPart.commit();
                partIndex++;
            }
            if (partIndex < itemParts.length) {
                // Truncate the parts array so _value reflects the current state
                itemParts.length = partIndex;
                this.clear(itemPart && itemPart.endNode);
            }
        }
        clear(startNode = this.startNode) {
            removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
        }
    }
    /**
     * Implements a boolean attribute, roughly as defined in the HTML
     * specification.
     *
     * If the value is truthy, then the attribute is present with a value of
     * ''. If the value is falsey, the attribute is removed.
     */
    class BooleanAttributePart {
        constructor(element, name, strings) {
            this.value = undefined;
            this._pendingValue = undefined;
            if (strings.length !== 2 || strings[0] !== '' || strings[1] !== '') {
                throw new Error('Boolean attributes can only contain a single expression');
            }
            this.element = element;
            this.name = name;
            this.strings = strings;
        }
        setValue(value) {
            this._pendingValue = value;
        }
        commit() {
            while (isDirective(this._pendingValue)) {
                const directive = this._pendingValue;
                this._pendingValue = noChange;
                directive(this);
            }
            if (this._pendingValue === noChange) {
                return;
            }
            const value = !!this._pendingValue;
            if (this.value !== value) {
                if (value) {
                    this.element.setAttribute(this.name, '');
                }
                else {
                    this.element.removeAttribute(this.name);
                }
            }
            this.value = value;
            this._pendingValue = noChange;
        }
    }
    /**
     * Sets attribute values for PropertyParts, so that the value is only set once
     * even if there are multiple parts for a property.
     *
     * If an expression controls the whole property value, then the value is simply
     * assigned to the property under control. If there are string literals or
     * multiple expressions, then the strings are expressions are interpolated into
     * a string first.
     */
    class PropertyCommitter extends AttributeCommitter {
        constructor(element, name, strings) {
            super(element, name, strings);
            this.single =
                (strings.length === 2 && strings[0] === '' && strings[1] === '');
        }
        _createPart() {
            return new PropertyPart(this);
        }
        _getValue() {
            if (this.single) {
                return this.parts[0].value;
            }
            return super._getValue();
        }
        commit() {
            if (this.dirty) {
                this.dirty = false;
                // tslint:disable-next-line:no-any
                this.element[this.name] = this._getValue();
            }
        }
    }
    class PropertyPart extends AttributePart {
    }
    // Detect event listener options support. If the `capture` property is read
    // from the options object, then options are supported. If not, then the thrid
    // argument to add/removeEventListener is interpreted as the boolean capture
    // value so we should only pass the `capture` property.
    let eventOptionsSupported = false;
    try {
        const options = {
            get capture() {
                eventOptionsSupported = true;
                return false;
            }
        };
        // tslint:disable-next-line:no-any
        window.addEventListener('test', options, options);
        // tslint:disable-next-line:no-any
        window.removeEventListener('test', options, options);
    }
    catch (_e) {
    }
    class EventPart {
        constructor(element, eventName, eventContext) {
            this.value = undefined;
            this._pendingValue = undefined;
            this.element = element;
            this.eventName = eventName;
            this.eventContext = eventContext;
            this._boundHandleEvent = (e) => this.handleEvent(e);
        }
        setValue(value) {
            this._pendingValue = value;
        }
        commit() {
            while (isDirective(this._pendingValue)) {
                const directive = this._pendingValue;
                this._pendingValue = noChange;
                directive(this);
            }
            if (this._pendingValue === noChange) {
                return;
            }
            const newListener = this._pendingValue;
            const oldListener = this.value;
            const shouldRemoveListener = newListener == null ||
                oldListener != null &&
                    (newListener.capture !== oldListener.capture ||
                        newListener.once !== oldListener.once ||
                        newListener.passive !== oldListener.passive);
            const shouldAddListener = newListener != null && (oldListener == null || shouldRemoveListener);
            if (shouldRemoveListener) {
                this.element.removeEventListener(this.eventName, this._boundHandleEvent, this._options);
            }
            if (shouldAddListener) {
                this._options = getOptions(newListener);
                this.element.addEventListener(this.eventName, this._boundHandleEvent, this._options);
            }
            this.value = newListener;
            this._pendingValue = noChange;
        }
        handleEvent(event) {
            if (typeof this.value === 'function') {
                this.value.call(this.eventContext || this.element, event);
            }
            else {
                this.value.handleEvent(event);
            }
        }
    }
    // We copy options because of the inconsistent behavior of browsers when reading
    // the third argument of add/removeEventListener. IE11 doesn't support options
    // at all. Chrome 41 only reads `capture` if the argument is an object.
    const getOptions = (o) => o &&
        (eventOptionsSupported ?
            { capture: o.capture, passive: o.passive, once: o.once } :
            o.capture);

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * Creates Parts when a template is instantiated.
     */
    class DefaultTemplateProcessor {
        /**
         * Create parts for an attribute-position binding, given the event, attribute
         * name, and string literals.
         *
         * @param element The element containing the binding
         * @param name  The attribute name
         * @param strings The string literals. There are always at least two strings,
         *   event for fully-controlled bindings with a single expression.
         */
        handleAttributeExpressions(element, name, strings, options) {
            const prefix = name[0];
            if (prefix === '.') {
                const comitter = new PropertyCommitter(element, name.slice(1), strings);
                return comitter.parts;
            }
            if (prefix === '@') {
                return [new EventPart(element, name.slice(1), options.eventContext)];
            }
            if (prefix === '?') {
                return [new BooleanAttributePart(element, name.slice(1), strings)];
            }
            const comitter = new AttributeCommitter(element, name, strings);
            return comitter.parts;
        }
        /**
         * Create parts for a text-position binding.
         * @param templateFactory
         */
        handleTextExpression(options) {
            return new NodePart(options);
        }
    }
    const defaultTemplateProcessor = new DefaultTemplateProcessor();

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * The default TemplateFactory which caches Templates keyed on
     * result.type and result.strings.
     */
    function templateFactory(result) {
        let templateCache = templateCaches.get(result.type);
        if (templateCache === undefined) {
            templateCache = {
                stringsArray: new WeakMap(),
                keyString: new Map()
            };
            templateCaches.set(result.type, templateCache);
        }
        let template = templateCache.stringsArray.get(result.strings);
        if (template !== undefined) {
            return template;
        }
        // If the TemplateStringsArray is new, generate a key from the strings
        // This key is shared between all templates with identical content
        const key = result.strings.join(marker);
        // Check if we already have a Template for this key
        template = templateCache.keyString.get(key);
        if (template === undefined) {
            // If we have not seen this key before, create a new Template
            template = new Template(result, result.getTemplateElement());
            // Cache the Template for this key
            templateCache.keyString.set(key, template);
        }
        // Cache all future queries for this TemplateStringsArray
        templateCache.stringsArray.set(result.strings, template);
        return template;
    }
    const templateCaches = new Map();

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const parts = new WeakMap();
    /**
     * Renders a template to a container.
     *
     * To update a container with new values, reevaluate the template literal and
     * call `render` with the new result.
     *
     * @param result a TemplateResult created by evaluating a template tag like
     *     `html` or `svg`.
     * @param container A DOM parent to render to. The entire contents are either
     *     replaced, or efficiently updated if the same result type was previous
     *     rendered there.
     * @param options RenderOptions for the entire render tree rendered to this
     *     container. Render options must *not* change between renders to the same
     *     container, as those changes will not effect previously rendered DOM.
     */
    const render = (result, container, options) => {
        let part = parts.get(container);
        if (part === undefined) {
            removeNodes(container, container.firstChild);
            parts.set(container, part = new NodePart(Object.assign({ templateFactory }, options)));
            part.appendInto(container);
        }
        part.setValue(result);
        part.commit();
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // IMPORTANT: do not change the property name or the assignment expression.
    // This line will be used in regexes to search for lit-html usage.
    // TODO(justinfagnani): inject version number at build time
    (window['litHtmlVersions'] || (window['litHtmlVersions'] = [])).push('1.0.0');
    /**
     * Interprets a template literal as an HTML template that can efficiently
     * render to and update a container.
     */
    const html = (strings, ...values) => new TemplateResult(strings, values, 'html', defaultTemplateProcessor);

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const walkerNodeFilter = 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */;
    /**
     * Removes the list of nodes from a Template safely. In addition to removing
     * nodes from the Template, the Template part indices are updated to match
     * the mutated Template DOM.
     *
     * As the template is walked the removal state is tracked and
     * part indices are adjusted as needed.
     *
     * div
     *   div#1 (remove) <-- start removing (removing node is div#1)
     *     div
     *       div#2 (remove)  <-- continue removing (removing node is still div#1)
     *         div
     * div <-- stop removing since previous sibling is the removing node (div#1,
     * removed 4 nodes)
     */
    function removeNodesFromTemplate(template, nodesToRemove) {
        const { element: { content }, parts } = template;
        const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
        let partIndex = nextActiveIndexInTemplateParts(parts);
        let part = parts[partIndex];
        let nodeIndex = -1;
        let removeCount = 0;
        const nodesToRemoveInTemplate = [];
        let currentRemovingNode = null;
        while (walker.nextNode()) {
            nodeIndex++;
            const node = walker.currentNode;
            // End removal if stepped past the removing node
            if (node.previousSibling === currentRemovingNode) {
                currentRemovingNode = null;
            }
            // A node to remove was found in the template
            if (nodesToRemove.has(node)) {
                nodesToRemoveInTemplate.push(node);
                // Track node we're removing
                if (currentRemovingNode === null) {
                    currentRemovingNode = node;
                }
            }
            // When removing, increment count by which to adjust subsequent part indices
            if (currentRemovingNode !== null) {
                removeCount++;
            }
            while (part !== undefined && part.index === nodeIndex) {
                // If part is in a removed node deactivate it by setting index to -1 or
                // adjust the index as needed.
                part.index = currentRemovingNode !== null ? -1 : part.index - removeCount;
                // go to the next active part.
                partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                part = parts[partIndex];
            }
        }
        nodesToRemoveInTemplate.forEach((n) => n.parentNode.removeChild(n));
    }
    const countNodes = (node) => {
        let count = (node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) ? 0 : 1;
        const walker = document.createTreeWalker(node, walkerNodeFilter, null, false);
        while (walker.nextNode()) {
            count++;
        }
        return count;
    };
    const nextActiveIndexInTemplateParts = (parts, startIndex = -1) => {
        for (let i = startIndex + 1; i < parts.length; i++) {
            const part = parts[i];
            if (isTemplatePartActive(part)) {
                return i;
            }
        }
        return -1;
    };
    /**
     * Inserts the given node into the Template, optionally before the given
     * refNode. In addition to inserting the node into the Template, the Template
     * part indices are updated to match the mutated Template DOM.
     */
    function insertNodeIntoTemplate(template, node, refNode = null) {
        const { element: { content }, parts } = template;
        // If there's no refNode, then put node at end of template.
        // No part indices need to be shifted in this case.
        if (refNode === null || refNode === undefined) {
            content.appendChild(node);
            return;
        }
        const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
        let partIndex = nextActiveIndexInTemplateParts(parts);
        let insertCount = 0;
        let walkerIndex = -1;
        while (walker.nextNode()) {
            walkerIndex++;
            const walkerNode = walker.currentNode;
            if (walkerNode === refNode) {
                insertCount = countNodes(node);
                refNode.parentNode.insertBefore(node, refNode);
            }
            while (partIndex !== -1 && parts[partIndex].index === walkerIndex) {
                // If we've inserted the node, simply adjust all subsequent parts
                if (insertCount > 0) {
                    while (partIndex !== -1) {
                        parts[partIndex].index += insertCount;
                        partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                    }
                    return;
                }
                partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
            }
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // Get a key to lookup in `templateCaches`.
    const getTemplateCacheKey = (type, scopeName) => `${type}--${scopeName}`;
    let compatibleShadyCSSVersion = true;
    if (typeof window.ShadyCSS === 'undefined') {
        compatibleShadyCSSVersion = false;
    }
    else if (typeof window.ShadyCSS.prepareTemplateDom === 'undefined') {
        console.warn(`Incompatible ShadyCSS version detected.` +
            `Please update to at least @webcomponents/webcomponentsjs@2.0.2 and` +
            `@webcomponents/shadycss@1.3.1.`);
        compatibleShadyCSSVersion = false;
    }
    /**
     * Template factory which scopes template DOM using ShadyCSS.
     * @param scopeName {string}
     */
    const shadyTemplateFactory = (scopeName) => (result) => {
        const cacheKey = getTemplateCacheKey(result.type, scopeName);
        let templateCache = templateCaches.get(cacheKey);
        if (templateCache === undefined) {
            templateCache = {
                stringsArray: new WeakMap(),
                keyString: new Map()
            };
            templateCaches.set(cacheKey, templateCache);
        }
        let template = templateCache.stringsArray.get(result.strings);
        if (template !== undefined) {
            return template;
        }
        const key = result.strings.join(marker);
        template = templateCache.keyString.get(key);
        if (template === undefined) {
            const element = result.getTemplateElement();
            if (compatibleShadyCSSVersion) {
                window.ShadyCSS.prepareTemplateDom(element, scopeName);
            }
            template = new Template(result, element);
            templateCache.keyString.set(key, template);
        }
        templateCache.stringsArray.set(result.strings, template);
        return template;
    };
    const TEMPLATE_TYPES = ['html', 'svg'];
    /**
     * Removes all style elements from Templates for the given scopeName.
     */
    const removeStylesFromLitTemplates = (scopeName) => {
        TEMPLATE_TYPES.forEach((type) => {
            const templates = templateCaches.get(getTemplateCacheKey(type, scopeName));
            if (templates !== undefined) {
                templates.keyString.forEach((template) => {
                    const { element: { content } } = template;
                    // IE 11 doesn't support the iterable param Set constructor
                    const styles = new Set();
                    Array.from(content.querySelectorAll('style')).forEach((s) => {
                        styles.add(s);
                    });
                    removeNodesFromTemplate(template, styles);
                });
            }
        });
    };
    const shadyRenderSet = new Set();
    /**
     * For the given scope name, ensures that ShadyCSS style scoping is performed.
     * This is done just once per scope name so the fragment and template cannot
     * be modified.
     * (1) extracts styles from the rendered fragment and hands them to ShadyCSS
     * to be scoped and appended to the document
     * (2) removes style elements from all lit-html Templates for this scope name.
     *
     * Note, <style> elements can only be placed into templates for the
     * initial rendering of the scope. If <style> elements are included in templates
     * dynamically rendered to the scope (after the first scope render), they will
     * not be scoped and the <style> will be left in the template and rendered
     * output.
     */
    const prepareTemplateStyles = (renderedDOM, template, scopeName) => {
        shadyRenderSet.add(scopeName);
        // Move styles out of rendered DOM and store.
        const styles = renderedDOM.querySelectorAll('style');
        // If there are no styles, skip unnecessary work
        if (styles.length === 0) {
            // Ensure prepareTemplateStyles is called to support adding
            // styles via `prepareAdoptedCssText` since that requires that
            // `prepareTemplateStyles` is called.
            window.ShadyCSS.prepareTemplateStyles(template.element, scopeName);
            return;
        }
        const condensedStyle = document.createElement('style');
        // Collect styles into a single style. This helps us make sure ShadyCSS
        // manipulations will not prevent us from being able to fix up template
        // part indices.
        // NOTE: collecting styles is inefficient for browsers but ShadyCSS
        // currently does this anyway. When it does not, this should be changed.
        for (let i = 0; i < styles.length; i++) {
            const style = styles[i];
            style.parentNode.removeChild(style);
            condensedStyle.textContent += style.textContent;
        }
        // Remove styles from nested templates in this scope.
        removeStylesFromLitTemplates(scopeName);
        // And then put the condensed style into the "root" template passed in as
        // `template`.
        insertNodeIntoTemplate(template, condensedStyle, template.element.content.firstChild);
        // Note, it's important that ShadyCSS gets the template that `lit-html`
        // will actually render so that it can update the style inside when
        // needed (e.g. @apply native Shadow DOM case).
        window.ShadyCSS.prepareTemplateStyles(template.element, scopeName);
        if (window.ShadyCSS.nativeShadow) {
            // When in native Shadow DOM, re-add styling to rendered content using
            // the style ShadyCSS produced.
            const style = template.element.content.querySelector('style');
            renderedDOM.insertBefore(style.cloneNode(true), renderedDOM.firstChild);
        }
        else {
            // When not in native Shadow DOM, at this point ShadyCSS will have
            // removed the style from the lit template and parts will be broken as a
            // result. To fix this, we put back the style node ShadyCSS removed
            // and then tell lit to remove that node from the template.
            // NOTE, ShadyCSS creates its own style so we can safely add/remove
            // `condensedStyle` here.
            template.element.content.insertBefore(condensedStyle, template.element.content.firstChild);
            const removes = new Set();
            removes.add(condensedStyle);
            removeNodesFromTemplate(template, removes);
        }
    };
    /**
     * Extension to the standard `render` method which supports rendering
     * to ShadowRoots when the ShadyDOM (https://github.com/webcomponents/shadydom)
     * and ShadyCSS (https://github.com/webcomponents/shadycss) polyfills are used
     * or when the webcomponentsjs
     * (https://github.com/webcomponents/webcomponentsjs) polyfill is used.
     *
     * Adds a `scopeName` option which is used to scope element DOM and stylesheets
     * when native ShadowDOM is unavailable. The `scopeName` will be added to
     * the class attribute of all rendered DOM. In addition, any style elements will
     * be automatically re-written with this `scopeName` selector and moved out
     * of the rendered DOM and into the document `<head>`.
     *
     * It is common to use this render method in conjunction with a custom element
     * which renders a shadowRoot. When this is done, typically the element's
     * `localName` should be used as the `scopeName`.
     *
     * In addition to DOM scoping, ShadyCSS also supports a basic shim for css
     * custom properties (needed only on older browsers like IE11) and a shim for
     * a deprecated feature called `@apply` that supports applying a set of css
     * custom properties to a given location.
     *
     * Usage considerations:
     *
     * * Part values in `<style>` elements are only applied the first time a given
     * `scopeName` renders. Subsequent changes to parts in style elements will have
     * no effect. Because of this, parts in style elements should only be used for
     * values that will never change, for example parts that set scope-wide theme
     * values or parts which render shared style elements.
     *
     * * Note, due to a limitation of the ShadyDOM polyfill, rendering in a
     * custom element's `constructor` is not supported. Instead rendering should
     * either done asynchronously, for example at microtask timing (for example
     * `Promise.resolve()`), or be deferred until the first time the element's
     * `connectedCallback` runs.
     *
     * Usage considerations when using shimmed custom properties or `@apply`:
     *
     * * Whenever any dynamic changes are made which affect
     * css custom properties, `ShadyCSS.styleElement(element)` must be called
     * to update the element. There are two cases when this is needed:
     * (1) the element is connected to a new parent, (2) a class is added to the
     * element that causes it to match different custom properties.
     * To address the first case when rendering a custom element, `styleElement`
     * should be called in the element's `connectedCallback`.
     *
     * * Shimmed custom properties may only be defined either for an entire
     * shadowRoot (for example, in a `:host` rule) or via a rule that directly
     * matches an element with a shadowRoot. In other words, instead of flowing from
     * parent to child as do native css custom properties, shimmed custom properties
     * flow only from shadowRoots to nested shadowRoots.
     *
     * * When using `@apply` mixing css shorthand property names with
     * non-shorthand names (for example `border` and `border-width`) is not
     * supported.
     */
    const render$1 = (result, container, options) => {
        const scopeName = options.scopeName;
        const hasRendered = parts.has(container);
        const needsScoping = container instanceof ShadowRoot &&
            compatibleShadyCSSVersion && result instanceof TemplateResult;
        // Handle first render to a scope specially...
        const firstScopeRender = needsScoping && !shadyRenderSet.has(scopeName);
        // On first scope render, render into a fragment; this cannot be a single
        // fragment that is reused since nested renders can occur synchronously.
        const renderContainer = firstScopeRender ? document.createDocumentFragment() : container;
        render(result, renderContainer, Object.assign({ templateFactory: shadyTemplateFactory(scopeName) }, options));
        // When performing first scope render,
        // (1) We've rendered into a fragment so that there's a chance to
        // `prepareTemplateStyles` before sub-elements hit the DOM
        // (which might cause them to render based on a common pattern of
        // rendering in a custom element's `connectedCallback`);
        // (2) Scope the template with ShadyCSS one time only for this scope.
        // (3) Render the fragment into the container and make sure the
        // container knows its `part` is the one we just rendered. This ensures
        // DOM will be re-used on subsequent renders.
        if (firstScopeRender) {
            const part = parts.get(renderContainer);
            parts.delete(renderContainer);
            if (part.value instanceof TemplateInstance) {
                prepareTemplateStyles(renderContainer, part.value.template, scopeName);
            }
            removeNodes(container, container.firstChild);
            container.appendChild(renderContainer);
            parts.set(container, part);
        }
        // After elements have hit the DOM, update styling if this is the
        // initial render to this container.
        // This is needed whenever dynamic changes are made so it would be
        // safest to do every render; however, this would regress performance
        // so we leave it up to the user to call `ShadyCSSS.styleElement`
        // for dynamic changes.
        if (!hasRendered && needsScoping) {
            window.ShadyCSS.styleElement(container.host);
        }
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * When using Closure Compiler, JSCompiler_renameProperty(property, object) is
     * replaced at compile time by the munged name for object[property]. We cannot
     * alias this function, so we have to use a small shim that has the same
     * behavior when not compiling.
     */
    window.JSCompiler_renameProperty =
        (prop, _obj) => prop;
    const defaultConverter = {
        toAttribute(value, type) {
            switch (type) {
                case Boolean:
                    return value ? '' : null;
                case Object:
                case Array:
                    // if the value is `null` or `undefined` pass this through
                    // to allow removing/no change behavior.
                    return value == null ? value : JSON.stringify(value);
            }
            return value;
        },
        fromAttribute(value, type) {
            switch (type) {
                case Boolean:
                    return value !== null;
                case Number:
                    return value === null ? null : Number(value);
                case Object:
                case Array:
                    return JSON.parse(value);
            }
            return value;
        }
    };
    /**
     * Change function that returns true if `value` is different from `oldValue`.
     * This method is used as the default for a property's `hasChanged` function.
     */
    const notEqual = (value, old) => {
        // This ensures (old==NaN, value==NaN) always returns false
        return old !== value && (old === old || value === value);
    };
    const defaultPropertyDeclaration = {
        attribute: true,
        type: String,
        converter: defaultConverter,
        reflect: false,
        hasChanged: notEqual
    };
    const microtaskPromise = Promise.resolve(true);
    const STATE_HAS_UPDATED = 1;
    const STATE_UPDATE_REQUESTED = 1 << 2;
    const STATE_IS_REFLECTING_TO_ATTRIBUTE = 1 << 3;
    const STATE_IS_REFLECTING_TO_PROPERTY = 1 << 4;
    const STATE_HAS_CONNECTED = 1 << 5;
    /**
     * Base element class which manages element properties and attributes. When
     * properties change, the `update` method is asynchronously called. This method
     * should be supplied by subclassers to render updates as desired.
     */
    class UpdatingElement extends HTMLElement {
        constructor() {
            super();
            this._updateState = 0;
            this._instanceProperties = undefined;
            this._updatePromise = microtaskPromise;
            this._hasConnectedResolver = undefined;
            /**
             * Map with keys for any properties that have changed since the last
             * update cycle with previous values.
             */
            this._changedProperties = new Map();
            /**
             * Map with keys of properties that should be reflected when updated.
             */
            this._reflectingProperties = undefined;
            this.initialize();
        }
        /**
         * Returns a list of attributes corresponding to the registered properties.
         * @nocollapse
         */
        static get observedAttributes() {
            // note: piggy backing on this to ensure we're finalized.
            this.finalize();
            const attributes = [];
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            this._classProperties.forEach((v, p) => {
                const attr = this._attributeNameForProperty(p, v);
                if (attr !== undefined) {
                    this._attributeToPropertyMap.set(attr, p);
                    attributes.push(attr);
                }
            });
            return attributes;
        }
        /**
         * Ensures the private `_classProperties` property metadata is created.
         * In addition to `finalize` this is also called in `createProperty` to
         * ensure the `@property` decorator can add property metadata.
         */
        /** @nocollapse */
        static _ensureClassProperties() {
            // ensure private storage for property declarations.
            if (!this.hasOwnProperty(JSCompiler_renameProperty('_classProperties', this))) {
                this._classProperties = new Map();
                // NOTE: Workaround IE11 not supporting Map constructor argument.
                const superProperties = Object.getPrototypeOf(this)._classProperties;
                if (superProperties !== undefined) {
                    superProperties.forEach((v, k) => this._classProperties.set(k, v));
                }
            }
        }
        /**
         * Creates a property accessor on the element prototype if one does not exist.
         * The property setter calls the property's `hasChanged` property option
         * or uses a strict identity check to determine whether or not to request
         * an update.
         * @nocollapse
         */
        static createProperty(name, options = defaultPropertyDeclaration) {
            // Note, since this can be called by the `@property` decorator which
            // is called before `finalize`, we ensure storage exists for property
            // metadata.
            this._ensureClassProperties();
            this._classProperties.set(name, options);
            // Do not generate an accessor if the prototype already has one, since
            // it would be lost otherwise and that would never be the user's intention;
            // Instead, we expect users to call `requestUpdate` themselves from
            // user-defined accessors. Note that if the super has an accessor we will
            // still overwrite it
            if (options.noAccessor || this.prototype.hasOwnProperty(name)) {
                return;
            }
            const key = typeof name === 'symbol' ? Symbol() : `__${name}`;
            Object.defineProperty(this.prototype, name, {
                // tslint:disable-next-line:no-any no symbol in index
                get() {
                    // tslint:disable-next-line:no-any no symbol in index
                    return this[key];
                },
                set(value) {
                    // tslint:disable-next-line:no-any no symbol in index
                    const oldValue = this[name];
                    // tslint:disable-next-line:no-any no symbol in index
                    this[key] = value;
                    this.requestUpdate(name, oldValue);
                },
                configurable: true,
                enumerable: true
            });
        }
        /**
         * Creates property accessors for registered properties and ensures
         * any superclasses are also finalized.
         * @nocollapse
         */
        static finalize() {
            if (this.hasOwnProperty(JSCompiler_renameProperty('finalized', this)) &&
                this.finalized) {
                return;
            }
            // finalize any superclasses
            const superCtor = Object.getPrototypeOf(this);
            if (typeof superCtor.finalize === 'function') {
                superCtor.finalize();
            }
            this.finalized = true;
            this._ensureClassProperties();
            // initialize Map populated in observedAttributes
            this._attributeToPropertyMap = new Map();
            // make any properties
            // Note, only process "own" properties since this element will inherit
            // any properties defined on the superClass, and finalization ensures
            // the entire prototype chain is finalized.
            if (this.hasOwnProperty(JSCompiler_renameProperty('properties', this))) {
                const props = this.properties;
                // support symbols in properties (IE11 does not support this)
                const propKeys = [
                    ...Object.getOwnPropertyNames(props),
                    ...(typeof Object.getOwnPropertySymbols === 'function') ?
                        Object.getOwnPropertySymbols(props) :
                        []
                ];
                // This for/of is ok because propKeys is an array
                for (const p of propKeys) {
                    // note, use of `any` is due to TypeSript lack of support for symbol in
                    // index types
                    // tslint:disable-next-line:no-any no symbol in index
                    this.createProperty(p, props[p]);
                }
            }
        }
        /**
         * Returns the property name for the given attribute `name`.
         * @nocollapse
         */
        static _attributeNameForProperty(name, options) {
            const attribute = options.attribute;
            return attribute === false ?
                undefined :
                (typeof attribute === 'string' ?
                    attribute :
                    (typeof name === 'string' ? name.toLowerCase() : undefined));
        }
        /**
         * Returns true if a property should request an update.
         * Called when a property value is set and uses the `hasChanged`
         * option for the property if present or a strict identity check.
         * @nocollapse
         */
        static _valueHasChanged(value, old, hasChanged = notEqual) {
            return hasChanged(value, old);
        }
        /**
         * Returns the property value for the given attribute value.
         * Called via the `attributeChangedCallback` and uses the property's
         * `converter` or `converter.fromAttribute` property option.
         * @nocollapse
         */
        static _propertyValueFromAttribute(value, options) {
            const type = options.type;
            const converter = options.converter || defaultConverter;
            const fromAttribute = (typeof converter === 'function' ? converter : converter.fromAttribute);
            return fromAttribute ? fromAttribute(value, type) : value;
        }
        /**
         * Returns the attribute value for the given property value. If this
         * returns undefined, the property will *not* be reflected to an attribute.
         * If this returns null, the attribute will be removed, otherwise the
         * attribute will be set to the value.
         * This uses the property's `reflect` and `type.toAttribute` property options.
         * @nocollapse
         */
        static _propertyValueToAttribute(value, options) {
            if (options.reflect === undefined) {
                return;
            }
            const type = options.type;
            const converter = options.converter;
            const toAttribute = converter && converter.toAttribute ||
                defaultConverter.toAttribute;
            return toAttribute(value, type);
        }
        /**
         * Performs element initialization. By default captures any pre-set values for
         * registered properties.
         */
        initialize() {
            this._saveInstanceProperties();
        }
        /**
         * Fixes any properties set on the instance before upgrade time.
         * Otherwise these would shadow the accessor and break these properties.
         * The properties are stored in a Map which is played back after the
         * constructor runs. Note, on very old versions of Safari (<=9) or Chrome
         * (<=41), properties created for native platform properties like (`id` or
         * `name`) may not have default values set in the element constructor. On
         * these browsers native properties appear on instances and therefore their
         * default value will overwrite any element default (e.g. if the element sets
         * this.id = 'id' in the constructor, the 'id' will become '' since this is
         * the native platform default).
         */
        _saveInstanceProperties() {
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            this.constructor
                ._classProperties.forEach((_v, p) => {
                if (this.hasOwnProperty(p)) {
                    const value = this[p];
                    delete this[p];
                    if (!this._instanceProperties) {
                        this._instanceProperties = new Map();
                    }
                    this._instanceProperties.set(p, value);
                }
            });
        }
        /**
         * Applies previously saved instance properties.
         */
        _applyInstanceProperties() {
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            // tslint:disable-next-line:no-any
            this._instanceProperties.forEach((v, p) => this[p] = v);
            this._instanceProperties = undefined;
        }
        connectedCallback() {
            this._updateState = this._updateState | STATE_HAS_CONNECTED;
            // Ensure connection triggers an update. Updates cannot complete before
            // connection and if one is pending connection the `_hasConnectionResolver`
            // will exist. If so, resolve it to complete the update, otherwise
            // requestUpdate.
            if (this._hasConnectedResolver) {
                this._hasConnectedResolver();
                this._hasConnectedResolver = undefined;
            }
            else {
                this.requestUpdate();
            }
        }
        /**
         * Allows for `super.disconnectedCallback()` in extensions while
         * reserving the possibility of making non-breaking feature additions
         * when disconnecting at some point in the future.
         */
        disconnectedCallback() {
        }
        /**
         * Synchronizes property values when attributes change.
         */
        attributeChangedCallback(name, old, value) {
            if (old !== value) {
                this._attributeToProperty(name, value);
            }
        }
        _propertyToAttribute(name, value, options = defaultPropertyDeclaration) {
            const ctor = this.constructor;
            const attr = ctor._attributeNameForProperty(name, options);
            if (attr !== undefined) {
                const attrValue = ctor._propertyValueToAttribute(value, options);
                // an undefined value does not change the attribute.
                if (attrValue === undefined) {
                    return;
                }
                // Track if the property is being reflected to avoid
                // setting the property again via `attributeChangedCallback`. Note:
                // 1. this takes advantage of the fact that the callback is synchronous.
                // 2. will behave incorrectly if multiple attributes are in the reaction
                // stack at time of calling. However, since we process attributes
                // in `update` this should not be possible (or an extreme corner case
                // that we'd like to discover).
                // mark state reflecting
                this._updateState = this._updateState | STATE_IS_REFLECTING_TO_ATTRIBUTE;
                if (attrValue == null) {
                    this.removeAttribute(attr);
                }
                else {
                    this.setAttribute(attr, attrValue);
                }
                // mark state not reflecting
                this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_ATTRIBUTE;
            }
        }
        _attributeToProperty(name, value) {
            // Use tracking info to avoid deserializing attribute value if it was
            // just set from a property setter.
            if (this._updateState & STATE_IS_REFLECTING_TO_ATTRIBUTE) {
                return;
            }
            const ctor = this.constructor;
            const propName = ctor._attributeToPropertyMap.get(name);
            if (propName !== undefined) {
                const options = ctor._classProperties.get(propName) || defaultPropertyDeclaration;
                // mark state reflecting
                this._updateState = this._updateState | STATE_IS_REFLECTING_TO_PROPERTY;
                this[propName] =
                    // tslint:disable-next-line:no-any
                    ctor._propertyValueFromAttribute(value, options);
                // mark state not reflecting
                this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_PROPERTY;
            }
        }
        /**
         * Requests an update which is processed asynchronously. This should
         * be called when an element should update based on some state not triggered
         * by setting a property. In this case, pass no arguments. It should also be
         * called when manually implementing a property setter. In this case, pass the
         * property `name` and `oldValue` to ensure that any configured property
         * options are honored. Returns the `updateComplete` Promise which is resolved
         * when the update completes.
         *
         * @param name {PropertyKey} (optional) name of requesting property
         * @param oldValue {any} (optional) old value of requesting property
         * @returns {Promise} A Promise that is resolved when the update completes.
         */
        requestUpdate(name, oldValue) {
            let shouldRequestUpdate = true;
            // if we have a property key, perform property update steps.
            if (name !== undefined && !this._changedProperties.has(name)) {
                const ctor = this.constructor;
                const options = ctor._classProperties.get(name) || defaultPropertyDeclaration;
                if (ctor._valueHasChanged(this[name], oldValue, options.hasChanged)) {
                    // track old value when changing.
                    this._changedProperties.set(name, oldValue);
                    // add to reflecting properties set
                    if (options.reflect === true &&
                        !(this._updateState & STATE_IS_REFLECTING_TO_PROPERTY)) {
                        if (this._reflectingProperties === undefined) {
                            this._reflectingProperties = new Map();
                        }
                        this._reflectingProperties.set(name, options);
                    }
                    // abort the request if the property should not be considered changed.
                }
                else {
                    shouldRequestUpdate = false;
                }
            }
            if (!this._hasRequestedUpdate && shouldRequestUpdate) {
                this._enqueueUpdate();
            }
            return this.updateComplete;
        }
        /**
         * Sets up the element to asynchronously update.
         */
        async _enqueueUpdate() {
            // Mark state updating...
            this._updateState = this._updateState | STATE_UPDATE_REQUESTED;
            let resolve;
            const previousUpdatePromise = this._updatePromise;
            this._updatePromise = new Promise((res) => resolve = res);
            // Ensure any previous update has resolved before updating.
            // This `await` also ensures that property changes are batched.
            await previousUpdatePromise;
            // Make sure the element has connected before updating.
            if (!this._hasConnected) {
                await new Promise((res) => this._hasConnectedResolver = res);
            }
            // Allow `performUpdate` to be asynchronous to enable scheduling of updates.
            const result = this.performUpdate();
            // Note, this is to avoid delaying an additional microtask unless we need
            // to.
            if (result != null &&
                typeof result.then === 'function') {
                await result;
            }
            resolve(!this._hasRequestedUpdate);
        }
        get _hasConnected() {
            return (this._updateState & STATE_HAS_CONNECTED);
        }
        get _hasRequestedUpdate() {
            return (this._updateState & STATE_UPDATE_REQUESTED);
        }
        get hasUpdated() {
            return (this._updateState & STATE_HAS_UPDATED);
        }
        /**
         * Performs an element update.
         *
         * You can override this method to change the timing of updates. For instance,
         * to schedule updates to occur just before the next frame:
         *
         * ```
         * protected async performUpdate(): Promise<unknown> {
         *   await new Promise((resolve) => requestAnimationFrame(() => resolve()));
         *   super.performUpdate();
         * }
         * ```
         */
        performUpdate() {
            // Mixin instance properties once, if they exist.
            if (this._instanceProperties) {
                this._applyInstanceProperties();
            }
            if (this.shouldUpdate(this._changedProperties)) {
                const changedProperties = this._changedProperties;
                this.update(changedProperties);
                this._markUpdated();
                if (!(this._updateState & STATE_HAS_UPDATED)) {
                    this._updateState = this._updateState | STATE_HAS_UPDATED;
                    this.firstUpdated(changedProperties);
                }
                this.updated(changedProperties);
            }
            else {
                this._markUpdated();
            }
        }
        _markUpdated() {
            this._changedProperties = new Map();
            this._updateState = this._updateState & ~STATE_UPDATE_REQUESTED;
        }
        /**
         * Returns a Promise that resolves when the element has completed updating.
         * The Promise value is a boolean that is `true` if the element completed the
         * update without triggering another update. The Promise result is `false` if
         * a property was set inside `updated()`. This getter can be implemented to
         * await additional state. For example, it is sometimes useful to await a
         * rendered element before fulfilling this Promise. To do this, first await
         * `super.updateComplete` then any subsequent state.
         *
         * @returns {Promise} The Promise returns a boolean that indicates if the
         * update resolved without triggering another update.
         */
        get updateComplete() {
            return this._updatePromise;
        }
        /**
         * Controls whether or not `update` should be called when the element requests
         * an update. By default, this method always returns `true`, but this can be
         * customized to control when to update.
         *
         * * @param _changedProperties Map of changed properties with old values
         */
        shouldUpdate(_changedProperties) {
            return true;
        }
        /**
         * Updates the element. This method reflects property values to attributes.
         * It can be overridden to render and keep updated element DOM.
         * Setting properties inside this method will *not* trigger
         * another update.
         *
         * * @param _changedProperties Map of changed properties with old values
         */
        update(_changedProperties) {
            if (this._reflectingProperties !== undefined &&
                this._reflectingProperties.size > 0) {
                // Use forEach so this works even if for/of loops are compiled to for
                // loops expecting arrays
                this._reflectingProperties.forEach((v, k) => this._propertyToAttribute(k, this[k], v));
                this._reflectingProperties = undefined;
            }
        }
        /**
         * Invoked whenever the element is updated. Implement to perform
         * post-updating tasks via DOM APIs, for example, focusing an element.
         *
         * Setting properties inside this method will trigger the element to update
         * again after this update cycle completes.
         *
         * * @param _changedProperties Map of changed properties with old values
         */
        updated(_changedProperties) {
        }
        /**
         * Invoked when the element is first updated. Implement to perform one time
         * work on the element after update.
         *
         * Setting properties inside this method will trigger the element to update
         * again after this update cycle completes.
         *
         * * @param _changedProperties Map of changed properties with old values
         */
        firstUpdated(_changedProperties) {
        }
    }
    /**
     * Marks class as having finished creating properties.
     */
    UpdatingElement.finalized = true;

    /**
    @license
    Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
    This code may only be used under the BSD style license found at
    http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
    http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
    found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
    part of the polymer project is also subject to an additional IP rights grant
    found at http://polymer.github.io/PATENTS.txt
    */
    const supportsAdoptingStyleSheets = ('adoptedStyleSheets' in Document.prototype) &&
        ('replace' in CSSStyleSheet.prototype);
    const constructionToken = Symbol();
    class CSSResult {
        constructor(cssText, safeToken) {
            if (safeToken !== constructionToken) {
                throw new Error('CSSResult is not constructable. Use `unsafeCSS` or `css` instead.');
            }
            this.cssText = cssText;
        }
        // Note, this is a getter so that it's lazy. In practice, this means
        // stylesheets are not created until the first element instance is made.
        get styleSheet() {
            if (this._styleSheet === undefined) {
                // Note, if `adoptedStyleSheets` is supported then we assume CSSStyleSheet
                // is constructable.
                if (supportsAdoptingStyleSheets) {
                    this._styleSheet = new CSSStyleSheet();
                    this._styleSheet.replaceSync(this.cssText);
                }
                else {
                    this._styleSheet = null;
                }
            }
            return this._styleSheet;
        }
        toString() {
            return this.cssText;
        }
    }
    const textFromCSSResult = (value) => {
        if (value instanceof CSSResult) {
            return value.cssText;
        }
        else {
            throw new Error(`Value passed to 'css' function must be a 'css' function result: ${value}. Use 'unsafeCSS' to pass non-literal values, but
            take care to ensure page security.`);
        }
    };
    /**
     * Template tag which which can be used with LitElement's `style` property to
     * set element styles. For security reasons, only literal string values may be
     * used. To incorporate non-literal values `unsafeCSS` may be used inside a
     * template string part.
     */
    const css = (strings, ...values) => {
        const cssText = values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]);
        return new CSSResult(cssText, constructionToken);
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // IMPORTANT: do not change the property name or the assignment expression.
    // This line will be used in regexes to search for LitElement usage.
    // TODO(justinfagnani): inject version number at build time
    (window['litElementVersions'] || (window['litElementVersions'] = []))
        .push('2.0.1');
    /**
     * Minimal implementation of Array.prototype.flat
     * @param arr the array to flatten
     * @param result the accumlated result
     */
    function arrayFlat(styles, result = []) {
        for (let i = 0, length = styles.length; i < length; i++) {
            const value = styles[i];
            if (Array.isArray(value)) {
                arrayFlat(value, result);
            }
            else {
                result.push(value);
            }
        }
        return result;
    }
    /** Deeply flattens styles array. Uses native flat if available. */
    const flattenStyles = (styles) => styles.flat ? styles.flat(Infinity) : arrayFlat(styles);
    class LitElement extends UpdatingElement {
        /** @nocollapse */
        static finalize() {
            super.finalize();
            // Prepare styling that is stamped at first render time. Styling
            // is built from user provided `styles` or is inherited from the superclass.
            this._styles =
                this.hasOwnProperty(JSCompiler_renameProperty('styles', this)) ?
                    this._getUniqueStyles() :
                    this._styles || [];
        }
        /** @nocollapse */
        static _getUniqueStyles() {
            // Take care not to call `this.styles` multiple times since this generates
            // new CSSResults each time.
            // TODO(sorvell): Since we do not cache CSSResults by input, any
            // shared styles will generate new stylesheet objects, which is wasteful.
            // This should be addressed when a browser ships constructable
            // stylesheets.
            const userStyles = this.styles;
            const styles = [];
            if (Array.isArray(userStyles)) {
                const flatStyles = flattenStyles(userStyles);
                // As a performance optimization to avoid duplicated styling that can
                // occur especially when composing via subclassing, de-duplicate styles
                // preserving the last item in the list. The last item is kept to
                // try to preserve cascade order with the assumption that it's most
                // important that last added styles override previous styles.
                const styleSet = flatStyles.reduceRight((set, s) => {
                    set.add(s);
                    // on IE set.add does not return the set.
                    return set;
                }, new Set());
                // Array.from does not work on Set in IE
                styleSet.forEach((v) => styles.unshift(v));
            }
            else if (userStyles) {
                styles.push(userStyles);
            }
            return styles;
        }
        /**
         * Performs element initialization. By default this calls `createRenderRoot`
         * to create the element `renderRoot` node and captures any pre-set values for
         * registered properties.
         */
        initialize() {
            super.initialize();
            this.renderRoot = this.createRenderRoot();
            // Note, if renderRoot is not a shadowRoot, styles would/could apply to the
            // element's getRootNode(). While this could be done, we're choosing not to
            // support this now since it would require different logic around de-duping.
            if (window.ShadowRoot && this.renderRoot instanceof window.ShadowRoot) {
                this.adoptStyles();
            }
        }
        /**
         * Returns the node into which the element should render and by default
         * creates and returns an open shadowRoot. Implement to customize where the
         * element's DOM is rendered. For example, to render into the element's
         * childNodes, return `this`.
         * @returns {Element|DocumentFragment} Returns a node into which to render.
         */
        createRenderRoot() {
            return this.attachShadow({ mode: 'open' });
        }
        /**
         * Applies styling to the element shadowRoot using the `static get styles`
         * property. Styling will apply using `shadowRoot.adoptedStyleSheets` where
         * available and will fallback otherwise. When Shadow DOM is polyfilled,
         * ShadyCSS scopes styles and adds them to the document. When Shadow DOM
         * is available but `adoptedStyleSheets` is not, styles are appended to the
         * end of the `shadowRoot` to [mimic spec
         * behavior](https://wicg.github.io/construct-stylesheets/#using-constructed-stylesheets).
         */
        adoptStyles() {
            const styles = this.constructor._styles;
            if (styles.length === 0) {
                return;
            }
            // There are three separate cases here based on Shadow DOM support.
            // (1) shadowRoot polyfilled: use ShadyCSS
            // (2) shadowRoot.adoptedStyleSheets available: use it.
            // (3) shadowRoot.adoptedStyleSheets polyfilled: append styles after
            // rendering
            if (window.ShadyCSS !== undefined && !window.ShadyCSS.nativeShadow) {
                window.ShadyCSS.ScopingShim.prepareAdoptedCssText(styles.map((s) => s.cssText), this.localName);
            }
            else if (supportsAdoptingStyleSheets) {
                this.renderRoot.adoptedStyleSheets =
                    styles.map((s) => s.styleSheet);
            }
            else {
                // This must be done after rendering so the actual style insertion is done
                // in `update`.
                this._needsShimAdoptedStyleSheets = true;
            }
        }
        connectedCallback() {
            super.connectedCallback();
            // Note, first update/render handles styleElement so we only call this if
            // connected after first update.
            if (this.hasUpdated && window.ShadyCSS !== undefined) {
                window.ShadyCSS.styleElement(this);
            }
        }
        /**
         * Updates the element. This method reflects property values to attributes
         * and calls `render` to render DOM via lit-html. Setting properties inside
         * this method will *not* trigger another update.
         * * @param _changedProperties Map of changed properties with old values
         */
        update(changedProperties) {
            super.update(changedProperties);
            const templateResult = this.render();
            if (templateResult instanceof TemplateResult) {
                this.constructor
                    .render(templateResult, this.renderRoot, { scopeName: this.localName, eventContext: this });
            }
            // When native Shadow DOM is used but adoptedStyles are not supported,
            // insert styling after rendering to ensure adoptedStyles have highest
            // priority.
            if (this._needsShimAdoptedStyleSheets) {
                this._needsShimAdoptedStyleSheets = false;
                this.constructor._styles.forEach((s) => {
                    const style = document.createElement('style');
                    style.textContent = s.cssText;
                    this.renderRoot.appendChild(style);
                });
            }
        }
        /**
         * Invoked on each update to perform rendering tasks. This method must return
         * a lit-html TemplateResult. Setting properties inside this method will *not*
         * trigger the element to update.
         */
        render() {
        }
    }
    /**
     * Ensure this class is marked as `finalized` as an optimization ensuring
     * it will not needlessly try to `finalize`.
     */
    LitElement.finalized = true;
    /**
     * Render method used to render the lit-html TemplateResult to the element's
     * DOM.
     * @param {TemplateResult} Template to render.
     * @param {Element|DocumentFragment} Node into which to render.
     * @param {String} Element name.
     * @nocollapse
     */
    LitElement.render = render$1;

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // On IE11, classList.toggle doesn't accept a second argument.
    // Since this is so minor, we just polyfill it.
    if (window.navigator.userAgent.match('Trident')) {
        DOMTokenList.prototype.toggle = function (token, force) {
            if (force === undefined || force) {
                this.add(token);
            }
            else {
                this.remove(token);
            }
            return force === undefined ? true : force;
        };
    }
    /**
     * Stores the ClassInfo object applied to a given AttributePart.
     * Used to unset existing values when a new ClassInfo object is applied.
     */
    const classMapCache = new WeakMap();
    /**
     * Stores AttributeParts that have had static classes applied (e.g. `foo` in
     * class="foo ${classMap()}"). Static classes are applied only the first time
     * the directive is run on a part.
     */
    // Note, could be a WeakSet, but prefer not requiring this polyfill.
    const classMapStatics = new WeakMap();
    /**
     * A directive that applies CSS classes. This must be used in the `class`
     * attribute and must be the only part used in the attribute. It takes each
     * property in the `classInfo` argument and adds the property name to the
     * element's `classList` if the property value is truthy; if the property value
     * is falsey, the property name is removed from the element's `classList`. For
     * example
     * `{foo: bar}` applies the class `foo` if the value of `bar` is truthy.
     * @param classInfo {ClassInfo}
     */
    const classMap = directive((classInfo) => (part) => {
        if (!(part instanceof AttributePart) || (part instanceof PropertyPart) ||
            part.committer.name !== 'class' || part.committer.parts.length > 1) {
            throw new Error('The `classMap` directive must be used in the `class` attribute ' +
                'and must be the only part in the attribute.');
        }
        // handle static classes
        if (!classMapStatics.has(part)) {
            part.committer.element.className = part.committer.strings.join(' ');
            classMapStatics.set(part, true);
        }
        // remove old classes that no longer apply
        const oldInfo = classMapCache.get(part);
        for (const name in oldInfo) {
            if (!(name in classInfo)) {
                part.committer.element.classList.remove(name);
            }
        }
        // add new classes
        for (const name in classInfo) {
            if (!oldInfo || (oldInfo[name] !== classInfo[name])) {
                // We explicitly want a loose truthy check here because
                // it seems more convenient that '' and 0 are skipped.
                part.committer.element.classList.toggle(name, Boolean(classInfo[name]));
            }
        }
        classMapCache.set(part, classInfo);
    });

    function pluralize (num, base, suffix = 's') {
      if (num === 1) { return base }
      return base + suffix
    }

    function joinPath (...args) {
      var str = args[0];
      for (let v of args.slice(1)) {
        v = v && typeof v === 'string' ? v : '';
        let left = str.endsWith('/');
        let right = v.startsWith('/');
        if (left !== right) str += v;
        else if (left) str += v.slice(1);
        else str += '/' + v;
      }
      return str
    }

    const reservedChars = /[ <>:"/\\|?*\x00-\x1F]/g;
    const endingDashes = /([-]+$)/g;
    function slugify (str = '') {
      return str.replace(reservedChars, '-').replace(endingDashes, '')
    }

    const yearFormatter = new Intl.DateTimeFormat('en-US', {year: 'numeric'});
    const CURRENT_YEAR = yearFormatter.format(new Date());

    // simple timediff fn
    // replace this with Intl.RelativeTimeFormat when it lands in Beaker
    // https://stackoverflow.com/questions/6108819/javascript-timestamp-to-relative-time-eg-2-seconds-ago-one-week-ago-etc-best
    const msPerMinute = 60 * 1000;
    const msPerHour = msPerMinute * 60;
    const msPerDay = msPerHour * 24;
    const msPerMonth = msPerDay * 30;
    const msPerYear = msPerDay * 365;
    const now = Date.now();
    function timeDifference (ts, short = false, postfix = 'ago') {
      ts = Number(new Date(ts));
      var elapsed = now - ts;
      if (elapsed < 1) elapsed = 1; // let's avoid 0 and negative values
      if (elapsed < msPerMinute) {
        let n = Math.round(elapsed/1000);
        return `${n}${short ? 's' : pluralize(n, ' second')} ${postfix}`
      } else if (elapsed < msPerHour) {
        let n = Math.round(elapsed/msPerMinute);
        return `${n}${short ? 'm' : pluralize(n, ' minute')} ${postfix}`
      } else if (elapsed < msPerDay) {
        let n = Math.round(elapsed/msPerHour);
        return `${n}${short ? 'h' : pluralize(n, ' hour')} ${postfix}`
      } else if (elapsed < msPerMonth) {
        let n = Math.round(elapsed/msPerDay);
        return `${n}${short ? 'd' : pluralize(n, ' day')} ${postfix}`
      } else if (elapsed < msPerYear) {
        let n = Math.round(elapsed/msPerMonth);
        return `${n}${short ? 'mo' : pluralize(n, ' month')} ${postfix}`
      } else {
        let n = Math.round(elapsed/msPerYear);
        return `${n}${short ? 'yr' : pluralize(n, ' year')} ${postfix}`
      }
    }

    const cssStr = css`
.toast-wrapper {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 20000;
  transition: opacity 0.1s ease;
}
.toast-wrapper.hidden {
  opacity: 0;
}
.toast {
  position: relative;
  min-width: 350px;
  max-width: 450px;
  background: #ddd;
  margin: 0;
  padding: 10px 15px;
  border-radius: 4px;
  font-size: 16px;
  color: #fff;
  background: rgba(0, 0, 0, 0.75);
  -webkit-font-smoothing: antialiased;
  font-weight: 600;
}
.toast.error {
  padding-left: 38px;
}
.toast.success {
  padding-left: 48px;
}
.toast.success:before,
.toast.error:before {
  position: absolute;
  left: 18px;
  top: 5px;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Cantarell, "Oxygen Sans", "Helvetica Neue", sans-serif;
  font-size: 22px;
  font-weight: bold;
}
.toast.primary {
  background: var(--color-blue);
}
.toast.success {
  background: #26b33e;
}
.toast.success:before {
  content: '✓';
}
.toast.error {
  background: #c72e25;
}
.toast.error:before {
  content: '!';
}
.toast .toast-btn {
  position: absolute;
  right: 15px;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
`;

    // exported api
    // =

    function create (message, type = '', time = 5000, button = null) {
      // destroy existing
      destroy();

      // render toast
      document.body.appendChild(new BeakerToast({message, type, button}));
      setTimeout(destroy, time);
    }

    // internal
    // =

    function destroy () {
      var toast = document.querySelector('beaker-toast');

      if (toast) {
        // fadeout before removing element
        toast.classList.add('hidden');
        setTimeout(() => toast.remove(), 500);
      }
    }

    class BeakerToast extends LitElement {
      constructor ({message, type, button}) {
        super();
        this.message = message;
        this.type = type;
        this.button = button;
      }

      render () {
        const onButtonClick = this.button ? (e) => { destroy(); this.button.click(e); } : undefined;
        return html`
    <div id="toast-wrapper" class="toast-wrapper ${this.button ? '' : 'nomouse'}">
      <p class="toast ${this.type}">${this.message} ${this.button ? html`<a class="toast-btn" @click=${onButtonClick}>${this.button.label}</a>` : ''}</p>
    </div>
    `
      }
    }
    BeakerToast.styles = cssStr;

    customElements.define('beaker-toast', BeakerToast);

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * For AttributeParts, sets the attribute if the value is defined and removes
     * the attribute if the value is undefined.
     *
     * For other part types, this directive is a no-op.
     */
    const ifDefined = directive((value) => (part) => {
        if (value === undefined && part instanceof AttributePart) {
            if (value !== part.value) {
                const name = part.committer.name;
                part.committer.element.removeAttribute(name);
            }
        }
        else {
            part.setValue(value);
        }
    });

    function findParent (node, test) {
      if (typeof test === 'string') {
        // classname default
        var cls = test;
        test = el => el.classList && el.classList.contains(cls);
      }

      while (node) {
        if (test(node)) {
          return node
        }
        node = node.parentNode;
      }
    }

    function emit (el, evt, opts = {}) {
      opts.bubbles = ('bubbles' in opts) ? opts.bubbles : true;
      opts.composed = ('composed' in opts) ? opts.composed : true;
      el.dispatchEvent(new CustomEvent(evt, opts));
    }

    /*!
     * Dynamically changing favicons with JavaScript
     * Works in all A-grade browsers except Safari and Internet Explorer
     * Demo: http://mathiasbynens.be/demo/dynamic-favicons
     */

    var _head = document.head || document.getElementsByTagName('head')[0]; // https://stackoverflow.com/a/2995536

    const cssStr$1 = css`
.dropdown {
  position: relative;
}

.dropdown.open .toggleable:not(.primary) {
  background: #dadada;
  box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.1);
  border-color: transparent;
  outline: 0;
}

.toggleable-container .dropdown-items {
  display: none;
}

.toggleable-container.hover:hover .dropdown-items,
.toggleable-container.open .dropdown-items {
  display: block;
}

.dropdown-items {
  width: 270px;
  position: absolute;
  right: 0px;
  z-index: 3000;
  background: #fff;
  border: 1px solid #dadada;
  border-radius: 10px;
  box-shadow: 0 2px 15px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dropdown-items .section {
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding: 5px 0;
}

.dropdown-items .section-header {
  padding: 2px 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-items .section-header.light {
  color: var(--color-text--light);
  font-weight: 500;
}

.dropdown-items .section-header.small {
  font-size: 12px;
}

.dropdown-items hr {
  border: 0;
  border-bottom: 1px solid #ddd;
}

.dropdown-items.thin {
  width: 170px;
}

.dropdown-items.wide {
  width: 400px;
}

.dropdown-items.compact .dropdown-item {
  padding: 2px 15px;
  border-bottom: 0;
}

.dropdown-items.compact .description {
  margin-left: 0;
}

.dropdown-items.compact hr {
  margin: 5px 0;
}

.dropdown-items.roomy .dropdown-item {
  padding: 10px 15px;
}

.dropdown-items.very-roomy .dropdown-item {
  padding: 20px 30px;
}

.dropdown-items.no-border .dropdown-item {
  border-bottom: 0;
}

.dropdown-items.center {
  left: 50%;
  right: unset;
  transform: translateX(-50%);
}

.dropdown-items.left {
  right: initial;
  left: 0;
}

.dropdown-items.over {
  top: 0;
}

.dropdown-items.top {
  bottom: calc(100% + 5px);
}

.dropdown-items.with-triangle:before {
  content: '';
  position: absolute;
  top: -8px;
  right: 10px;
  width: 12px;
  height: 12px;
  z-index: 3;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 8px solid #fff;
}

.dropdown-items.with-triangle.left:before {
  left: 10px;
}

.dropdown-items.with-triangle.center:before {
  left: 43%;
}

.dropdown-title {
  border-bottom: 1px solid #eee;
  padding: 2px 8px;
  font-size: 11px;
  color: gray;
}

.dropdown-item {
  display: block;
  padding: 7px 15px;
  border-bottom: 1px solid #eee;
}

.dropdown-item.disabled {
  opacity: 0.25;
}

.dropdown-item .fa-check-square {
  color: var(--color-blue);
}

.dropdown-item .fa-check-square,
.dropdown-item .fa-square-o {
  font-size: 14px;
}

.dropdown-item .fa-check {
  font-size: 11.5px;
}

.dropdown-item.no-border {
  border-bottom: 0;
}

.dropdown-item:hover:not(.no-hover) {
  background: #eee;
  cursor: pointer;
}

.dropdown-item:hover:not(.no-hover) i:not(.fa-check-square) {
  color: var(--color-text);
}

.dropdown-item:hover:not(.no-hover) .description {
  color: var(--color-text);
}

.dropdown-item:hover:not(.no-hover).disabled {
  background: inherit;
  cursor: default;
}

.dropdown-item .fa,
.dropdown-item i {
  display: inline-block;
  width: 20px;
  color: rgba(0, 0, 0, 0.65);
}

.dropdown-item .fa-fw {
  margin-left: -3px;
  margin-right: 3px;
}

.dropdown-item img {
  display: inline-block;
  width: 16px;
  position: relative;
  top: 3px;
  margin-right: 6px;
}

.dropdown-item .btn .fa {
  color: inherit;
}

.dropdown-item .label {
  font-weight: 500;
  margin-bottom: 3px;
}

.dropdown-item .description {
  color: var(--color-text--muted);
  margin: 0;
  margin-left: 23px;
  margin-bottom: 3px;
  line-height: 1.5;
}

.dropdown-item .description.small {
  font-size: 12.5px;
}

.dropdown-item:first-of-type {
  border-radius: 2px 2px 0 0;
}

.dropdown-item:last-of-type {
  border-radius: 0 0 2px 2px;
}
`;

    // globals
    // =

    var resolve;

    // exported api
    // =

    // create a new context menu
    // - returns a promise that will resolve to undefined when the menu goes away
    // - example usage:
    /*
    create({
      // where to put the menu
      x: e.clientX,
      y: e.clientY,

      // align edge to right instead of left
      right: true,

      // use triangle
      withTriangle: true,

      // roomy style
      roomy: true,

      // no borders on items
      noBorders: false,

      // additional styles on dropdown-items
      style: 'font-size: 14px',

      // parent element to append to
      parent: document.body,

      // url to fontawesome css
      fontAwesomeCSSUrl: 'beaker://assets/font-awesome.css',

      // menu items
      items: [
        // icon from font-awesome
        {icon: 'fa fa-link', label: 'Copy link', click: () => writeToClipboard('...')}
      ]

      // instead of items, can give render()
      render () {
        return html`
          <img src="smile.png" onclick=${contextMenu.destroy} />
        `
      }
    }
    */
    function create$1 (opts) {
      // destroy any existing
      destroy$1();

      // extract attrs
      var parent = opts.parent || document.body;

      // render interface
      parent.appendChild(new BeakerContextMenu(opts));
      document.addEventListener('keyup', onKeyUp);
      document.addEventListener('click', onClickAnywhere);

      // return promise
      return new Promise(_resolve => {
        resolve = _resolve;
      })
    }

    function destroy$1 (value) {
      const el = document.querySelector('beaker-context-menu');
      if (el) {
        el.parentNode.removeChild(el);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('click', onClickAnywhere);
        resolve(value);
      }
    }

    // global event handlers
    // =

    function onKeyUp (e) {
      e.preventDefault();
      e.stopPropagation();

      if (e.keyCode === 27) {
        destroy$1();
      }
    }

    function onClickAnywhere (e) {
      if (!findParent(e.target, el => el.tagName === 'BEAKER-CONTEXT-MENU')) {
        // click is outside the context-menu, destroy
        destroy$1();
      }
    }

    // internal
    // =

    class BeakerContextMenu extends LitElement {
      constructor ({x, y, right, center, top, withTriangle, roomy, noBorders, style, items, fontAwesomeCSSUrl, render}) {
        super();
        this.x = x;
        this.y = y;
        this.right = right || false;
        this.center = center || false;
        this.top = top || false;
        this.withTriangle = withTriangle || false;
        this.roomy = roomy || false;
        this.noBorders = noBorders || false;
        this.customStyle = style || undefined;
        this.items = items;
        this.fontAwesomeCSSUrl = fontAwesomeCSSUrl;
        this.customRender = render;
      }

      // calls the global destroy
      // (this function exists so that custom renderers can destroy with this.destroy)
      destroy () {
        destroy$1();
      }

      // rendering
      // =

      render () {
        const cls = classMap({
          'dropdown-items': true,
          right: this.right,
          center: this.center,
          left: !this.right,
          top: this.top,
          'with-triangle': this.withTriangle,
          roomy: this.roomy,
          'no-border': this.noBorders
        });
        var style = '';
        if (this.x) style += `left: ${this.x}px; `;
        if (this.y) style += `top: ${this.y}px; `;
        return html`
      ${this.fontAwesomeCSSUrl ? html`<link rel="stylesheet" href="${this.fontAwesomeCSSUrl}">` : ''}
      <div class="context-menu dropdown" style="${style}">
        ${this.customRender
          ? this.customRender()
          : html`
            <div class="${cls}" style="${ifDefined(this.customStyle)}">
              ${this.items.map(item => {
                if (item === '-') {
                  return html`<hr />`
                }
                if (item.type === 'html') {
                  return item
                }
                var icon = item.icon;
                if (typeof icon === 'string' && !icon.includes(' ')) {
                  icon = 'fa fa-' + icon;
                }
                if (item.disabled) {
                  return html`
                    <div class="dropdown-item disabled">
                      ${icon !== false ? html`<i class="${icon}"></i>` : ''}
                      ${item.label}
                    </div>
                  `
                }
                if (item.href) {
                  return html`
                    <a class="dropdown-item" href=${item.href}>
                      ${icon !== false ? html`<i class="${icon}"></i>` : ''}
                      ${item.label}
                    </a>
                  `
                }
                return html`
                  <div class="dropdown-item" @click=${() => { destroy$1(); item.click(); }}>
                    ${typeof icon === 'string'
                      ? html`<i class="${icon}"></i>`
                      : icon ? icon : ''}
                    ${item.label}
                  </div>
                `
              })}
            </div>`
        }
      </div>`
      }
    }

    BeakerContextMenu.styles = css`
${cssStr$1}

.context-menu {
  position: fixed;
  z-index: 10000;
}

.dropdown-items {
  width: auto;
  white-space: nowrap;
}

a.dropdown-item {
  color: inherit;
  text-decoration: none;
}

.dropdown-item,
.dropdown-items.roomy .dropdown-item {
  padding-right: 30px; /* add a little cushion to the right */
}

/* custom icon css */
.fa-long-arrow-alt-right.custom-link-icon {
  position: relative;
  transform: rotate(-45deg);
  left: 1px;
}
.fa-custom-path-icon:after {
  content: './';
  letter-spacing: -1px;
  font-family: var(--code-font);
}
`;

    customElements.define('beaker-context-menu', BeakerContextMenu);

    function writeToClipboard (str) {
      var textarea = document.createElement('textarea');
      textarea.textContent = str;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    function create$2 ({x, y, targetLabel, url}) {
      function onClickCopy (e) {
        writeToClipboard(url);
        create('Copied to your clipboard');
      }
      create$1({
        x,
        y,
        render () {
          return html`
        <link rel="stylesheet" href="/css/font-awesome.css">
        <div class="share-menu">
          <p>Anybody with this link can view the ${targetLabel}</p>
          <p>
            <input type="text" value=${url}>
            <a @click=${onClickCopy}><span class="fas fa-paste"></span></a>
          </p>
        </div>
        <style>
          .share-menu {
            background: #fff;
            border-radius: 8px;
            box-sizing: border-box;
            padding: 12px;
            box-shadow: 0 2px 15px rgba(0, 0, 0, 0.3);
          }
          .share-menu p {
            position: relative;
          }
          .share-menu > :first-child {
            margin-top: 0;
          }
          .share-menu > :last-child {
            margin-bottom: 0;
          }
          input {
            width: 100%;
            border: 0;
            border-radius: 8px;
            padding: 4px 4px 4px 22px;
            box-sizing: border-box;
            background: #f5f5fa;
            outline: 0;
          }
          a {
            position: absolute;
            top: 0;
            left: 0;
            border-radius: 50%;
            box-sizing: border-box;
            padding: 4px 5px;
            background: #f5f5fa;
          }
          a:hover {
            cursor: pointer;
            background: #dde;
          }
        </style>
      `
        }
      });
    }

    /**
     * @param {string} containingPath
     * @param {string} title
     * @param {Object} fs
     * @param {string} ext
     * @returns {Promise<string>}
     */
    async function getAvailableName (containingPath, title, fs = navigator.filesystem, ext = '') {
      var basename = slugify((title || '').trim() || 'untitled').toLowerCase();
      for (let i = 1; i < 1e9; i++) {
        let name = ((i === 1) ? basename : `${basename}-${i}`) + (ext ? `.${ext}` : '');
        let st = await fs.stat(joinPath(containingPath, name), fs).catch(e => null);
        if (!st) return name
      }
      // yikes if this happens
      throw new Error('Unable to find an available name for ' + title)
    }

    const ICONS = {
      root: {
        '/desktop': 'fas fa-th',
        '/library': 'fas fa-university',
        '/library/bookmarks': 'fas fa-star',
        '/library/documents': 'fas fa-file-word',
        '/library/media': 'fas fa-photo-video',
        '/library/projects': 'fas fa-coffee',
        '/system': 'fas fa-cog',
        '/system/drives': 'fas fa-hdd',
        '/system/templates': 'fas fa-drafting-compass',
        '/system/webterm': 'fas fa-terminal'
      },
      person: {
        '/comments': 'fas fa-comment',
        '/follows': 'fas fa-user-friends',
        '/posts': 'fa fa-rss',
        '/votes': 'fas fa-vote-yea'
      },
      common: {
      }
    };

    function toSimpleItemGroups (items) {
      var groups = {};
      const add = (id, label, item) => {
        if (!groups[id]) groups[id] = {id, label, items: [item]};
        else groups[id].items.push(item);
      };
      for (let i of items) {
        if (i.stat.isDirectory()) {
          add('folders', 'Folders', i);
        } else {
          add('files', 'Files', i);
        }
      }

      const groupsOrder = ['folders', 'files'];
      var groupsArr = [];
      for (let id in groups) {
        groupsArr[groupsOrder.indexOf(id)] = groups[id];
      }
      return groupsArr
    }

    function getSubicon (driveKind, item) {
      if (driveKind === 'root') {
        return ICONS.root[item.realPath] || ICONS.common[item.realPath]
      } else if (driveKind === 'person') {
        return ICONS.person[item.realPath] || ICONS.common[item.realPath]
      }
    }

    async function doCopyOrMove ({sourceItem, targetFolder}, op) {
      let sourceItemParsed = new URL(sourceItem);
      var sourceDrive = new Hyperdrive(sourceItemParsed.hostname);
      let targetFolderParsed = new URL(targetFolder);
      var targetDrive = new Hyperdrive(targetFolderParsed.hostname);

      var name = sourceItemParsed.pathname.split('/').pop();
      var targetPath = joinPath(targetFolderParsed.pathname, name);
      var targetSt = await (targetDrive.stat(targetPath).catch(e => undefined));
      if (targetSt) {
        if (targetSt.isFile() && !confirm(`${name} already exists in the target folder. Overwrite?`)) {
          throw new Error('Canceled')
        } else if (targetSt.isDirectory()) {
          alert(`A folder named "${name}" already exists in the target folder and cannot be overwritten.`);
          throw new Error('Canceled')
        }
      }

      return op(sourceDrive, sourceItemParsed.pathname, targetDrive, targetPath)
    }

    async function doCopy (params) {
      return doCopyOrMove(params, (sourceDrive, sourcePath, targetDrive, targetPath) => sourceDrive.copy(sourcePath, joinPath(targetDrive.url, targetPath)))
    }

    async function doMove (params) {
      return doCopyOrMove(params, (sourceDrive, sourcePath, targetDrive, targetPath) => sourceDrive.rename(sourcePath, joinPath(targetDrive.url, targetPath)))
    }

    function doImport (targetFolder, fileOrFolder) {
      let targetFolderParsed = new URL(targetFolder);
      var targetDrive = new Hyperdrive(targetFolderParsed.hostname);

      const handleFileOrFolder = (entry, path = '') => {
        if (entry.isDirectory) {
          return handleFolder(entry, path)
        } else if (entry.isFile) {
          return handleFile(entry, path)
        }
      };

      const handleFolder = (folderEntry, path) => {
        return new Promise((resolve, reject) => {
          var dirReader = folderEntry.createReader();
          dirReader.readEntries(async (entries) => {
            try {
              var name = folderEntry.name;
              var targetPath = joinPath(targetFolderParsed.pathname, path, name);
              var targetSt = await (targetDrive.stat(targetPath).catch(e => undefined));
              if (targetSt) {
                if (!confirm(`${name} already exists in the target folder. Overwrite?`)) {
                  throw new Error('Canceled')
                }
                if (targetSt.isFile()) {
                  await targetDrive.unlink(targetPath);
                } else {
                  await targetDrive.rmdir(targetPath, {recursive: true});
                }
              }
              await targetDrive.mkdir(joinPath(path, name));

              for (let entry of entries) {
                await handleFileOrFolder(entry, joinPath(path, name));
              }
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        })
      };

      const handleFile = (fileEntry, path) => {
        return new Promise((resolve, reject) => {
          fileEntry.file(file => {
            let reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onloadend = async () => {
              try {
                var name = file.name;
                var targetPath = joinPath(targetFolderParsed.pathname, path, name);
                var targetSt = await (targetDrive.stat(targetPath).catch(e => undefined));
                if (targetSt) {
                  if (targetSt.isFile() && !confirm(`${name} already exists in the target folder. Overwrite?`)) {
                    throw new Error('Canceled')
                  } else if (targetSt.isDirectory()) {
                    alert(`A folder named "${name}" already exists in the target folder and cannot be overwritten.`);
                    throw new Error('Canceled')
                  }
                }
                await targetDrive.writeFile(joinPath(path, name), reader.result, 'buffer');
                resolve();
              } catch (e) {
                reject(e);
              }
            };
          });
        })
      };
      
      handleFileOrFolder(fileOrFolder.webkitGetAsEntry());
    }

    async function canWriteTo (url) {
      let urlp = new URL(url);
      let drive = new Hyperdrive(urlp.host);
      let acc = [];
      for (let segment of urlp.pathname.split('/')) {
        acc.push(segment);
        let st = await drive.stat(acc.join('/'));
        if (st.mount && st.mount.key) {
          drive = new Hyperdrive(st.mount.key);
          acc = [];
        }
      }
      return (await drive.getInfo()).writable
    }

    var url = location.pathname.slice(1); // slice past the '/'
    if (url && url.startsWith('hd://')) {
      // remove the 'hd://'
      history.replaceState(undefined, document.title, window.location.origin + '/' + url.slice('hd://'.length));
    } else if (!url && navigator.filesystem) {
      window.location = `/${navigator.filesystem.url.slice('hd://'.length)}`;
    } else {
      url = 'hd://' + url;
    }
    var urlp;
    try {
      urlp = new URL(url);
    } catch (e) {
      urlp = {hostname: undefined, pathname: undefined};
    }

    function getUrl () {
      return url || undefined
    }

    function setUrl (url) {
      window.location = `/${url.replace(/^hd:\/\//, '')}`;
    }

    function setPath (path) {
      urlp.pathname = path;
      setUrl(urlp.toString());
    }

    function openUrl (url) {
      window.open(`${window.location.origin}/${url.replace(/^hd:\/\//, '')}`);
    }

    function getOrigin () {
      return urlp.origin
    }

    function getPath () {
      return urlp.pathname
    }

    function constructItems (app) {
      var items = [];
      if (app.selection.length === 1 || app.pathInfo.isFile()) {
        let sel = app.selection[0] || app.locationAsItem;
        let writable = app.selection.reduce((acc, v) => acc && v.drive.writable, true);
        items.push({
          icon: 'fas fa-fw fa-external-link-alt',
          label: 'Open in new tab',
          click: () => app.goto(sel, true)
        });
        items.push({
          icon: 'fas fa-fw fa-desktop',
          label: 'Open as website',
          click: () => app.goto(app.getShareUrl(sel), true, true)
        });
        items.push({
          icon: html`
        <i class="fa-stack" style="font-size: 6px">
          <span class="far fa-fw fa-hdd fa-stack-2x"></span>
          <span class="fas fa-fw fa-share fa-stack-1x" style="margin-left: -10px; margin-top: -5px; font-size: 7px"></span>
        </i>
      `,
          label: 'Copy drive link',
          disabled: !app.canShare(sel),
          click: () => {
            writeToClipboard(sel.shareUrl);
            create('Copied to clipboard');
          }
        });
        items.push({
          icon: 'custom-path-icon',
          label: `Copy ${sel.stat.isFile() ? 'file' : 'folder'} path`,
          click: () => {
            var path = app.selection[0] ? sel.path : getPath();
            writeToClipboard(path);
            create('Copied to clipboard');
          }
        });
        if (!app.isViewingQuery) {
          items.push('-');
          if (sel.stat.isFile()) {
            items.push({
              icon: 'fas fa-fw fa-edit',
              label: 'Edit',
              disabled: !writable || !sel.stat.isFile(),
              click: () => {
                if (app.selection[0]) {
                  setUrl(joinPath(getOrigin(), sel.path) + '#edit');
                } else {
                  window.location.hash = 'edit';
                  window.location.reload();
                }
              }
            });
          }
          items.push({
            icon: 'fas fa-fw fa-i-cursor',
            label: 'Rename',
            disabled: !writable,
            click: () => app.onRename()
          });
          items.push({
            icon: 'fas fa-fw fa-trash',
            label: 'Delete',
            disabled: !writable,
            click: () => app.onDelete()
          });
          items.push('-');
          if (!sel.stat.isFile()) {
            items.push({
              icon: html`<i style="padding-left: 2px; font-size: 16px; box-sizing: border-box">◨</i>`,
              label: 'Diff / merge',
              click: () => app.doCompare(sel.url)
            });
          }
          items.push({
            icon: 'fas fa-fw fa-file-export',
            label: 'Export',
            click: () => app.onExport()
          });
        }
      } else if (app.selection.length > 1) {
        let writable = app.selection.reduce((acc, v) => acc && v.drive.writable, true);
        items.push({
          icon: 'fas fa-fw fa-trash',
          label: 'Delete',
          disabled: !writable,
          click: () => app.onDelete()
        });
        items.push({
          icon: 'fas fa-fw fa-file-export',
          label: 'Export',
          click: () => app.onExport()
        });
      } else {
        let writable = app.currentDriveInfo.writable;
        items.push({
          icon: 'far fa-fw fa-file',
          label: 'New file',
          disabled: !writable,
          click: () => app.onNewFile()
        });
        items.push({
          icon: 'far fa-fw fa-folder',
          label: 'New folder',
          disabled: !writable,
          click: () => app.onNewFolder()
        });
        items.push({
          icon: 'fas fa-fw fa-long-arrow-alt-right custom-link-icon',
          label: 'New link',
          disabled: !writable,
          click: () => app.onNewMount()
        });
        items.push('-');
        items.push({
          icon: 'fas fa-fw fa-desktop',
          label: 'Open as website',
          disabled: !app.canShare(app.locationAsItem),
          click: () => app.goto(app.getShareUrl(app.locationAsItem), true, true)
        });
        items.push({
          icon: html`
        <i class="fa-stack" style="font-size: 6px">
          <span class="far fa-fw fa-hdd fa-stack-2x"></span>
          <span class="fas fa-fw fa-share fa-stack-1x" style="margin-left: -10px; margin-top: -5px; font-size: 7px"></span>
        </i>
      `,
          label: `Copy drive link`,
          disabled: !app.canShare(app.locationAsItem),
          click: () => {
            writeToClipboard(app.getShareUrl(app.locationAsItem));
            create('Copied to clipboard');
          }
        });
        items.push({
          icon: 'custom-path-icon',
          label: `Copy path`,
          click: () => {
            writeToClipboard(getPath());
            create('Copied to clipboard');
          }
        });
        items.push('-');
        items.push({
          icon: 'far fa-fw fa-clone',
          label: 'Clone this drive',
          disabled: !app.canShare(app.locationAsItem),
          click: () => app.onCloneDrive()
        });
        items.push({
          icon: html`<i style="padding-left: 2px; font-size: 16px; box-sizing: border-box">◨</i>`,
          label: 'Diff / merge',
          click: () => app.doCompare(getUrl())
        });
        items.push({
          icon: 'fas fa-fw fa-file-import',
          label: 'Import',
          disabled: !writable,
          click: () => app.onImport()
        });
        items.push({
          icon: 'fas fa-fw fa-file-export',
          label: 'Export',
          click: () => app.onExport()
        });
      }
      return items
    }

    function create$3 (app, {x, y}) {
      function onChangeRenderMode (e, id) {
        app.onChangeRenderMode(e, id);
        this.requestUpdate();
      }

      function onToggleInlineMode (e) {
        app.onToggleInlineMode();
        this.requestUpdate();
      }

      function onChangeSortMode (e) {
        app.onChangeSortMode(e);
        this.requestUpdate();
      }

      function onApplyViewSettingsGlobally (e) {
        app.onApplyViewSettingsGlobally(e);
        this.requestUpdate();
      }
      
      const renderModes = app.renderModes;
      const isViewfile = app.pathInfo.isFile() && getPath().endsWith('.view');
      const isFolderLike = app.pathInfo.isDirectory() || isViewfile;

      return create$1({
        x,
        y,
        render () {
          const sortModeOpt = (id, label) => html`
        <option ?selected=${id === app.sortMode} value=${id}>⇅ Sort by ${label}</option>
      `;
          return html`
        <link rel="stylesheet" href="/css/font-awesome.css">
        <div class="settings-menu">
          ${renderModes.length ? html`
            <h5>View mode</h5>
            <div class="render-modes">
              ${renderModes.map(([id, icon, label]) => html`
                <div
                  class="btn transparent ${id == app.renderMode ? 'pressed' : ''}"
                  @click=${e => onChangeRenderMode.call(this, e, id)}
                  title="Change the view to: ${label}"
                >
                  <div><span class="fas fa-${icon}"></span></div>
                  <div>${label}</div>
                </div>
              `)}
            </div>
          ` : ''}
          ${isFolderLike ? html`
            <div class="btn ${app.inlineMode ? 'pressed' : ''}" @click=${onToggleInlineMode.bind(this)}>
              <span class="far fa-fw fa-${app.inlineMode ? 'check-square' : 'square'}"></span>
              Show the content of files
            </div>
            <div class="sort-modes">
              <select @change=${onChangeSortMode.bind(this)}>
                ${sortModeOpt('name', 'name')}
                ${sortModeOpt('name-reversed', 'name, reversed')}
                ${sortModeOpt('newest', 'newest')}
                ${sortModeOpt('oldest', 'oldest')}
                ${sortModeOpt('recently-changed', 'recently changed')}
              </select>
            </div>
            <div class="btn bottom-btn" @click=${onApplyViewSettingsGlobally}>
              Apply as default view settings
            </div>
          ` : ''}
        </div>
        <style>
          .settings-menu {
            background: #fff;
            border-radius: 8px;
            box-sizing: border-box;
            padding: 12px;
            box-shadow: 0 2px 15px rgba(0, 0, 0, 0.3);
            transform: translateX(-50%);
          }
          .settings-menu > * {
            margin-bottom: 5px;
          }
          .settings-menu > :first-child {
            margin-top: 0;
          }
          .settings-menu > :last-child {
            margin-bottom: 0;
          }
          .btn,
          select {
            display: block;
            -webkit-appearance: none;
            box-sizing: border-box;
            border-radius: 4px;
            cursor: pointer;
            padding: 6px 8px;
            border: 1px solid #ccd;
            color: #556;
            background: #fff;
            text-align: center;
            outline: 0;
          }
          .btn.pressed,
          .btn:hover,
          select:hover {
            background: #f5f5fd;
            border-color: #aab;
            color: #223;
          }
          span.btn {
            display: inline-block;
          }
          select {
            width: 100%;
            font-size: inherit;
            padding-top: 5px;
            padding-bottom: 4px;
            text-align-last: center;
          }
          .render-modes {
            display: flex;
          }
          .render-modes .btn {
            width: 100px;
            height: 80px;
            margin-right: 5px;
            text-align: center;
            line-height: 2.8;
            padding: 20px 0;
            font-size: 11px;
          }
          .render-modes .fas {
            font-size: 18px;
          }
          .render-modes > div:last-child {
            margin-right: 0;
          }
          .bottom-btn {
            margin: 8px -12px -12px !important;
            border: 0;
            border-top: 1px solid #ccd;
            border-radius: 0;
            border-bottom-left-radius: 8px;
            border-bottom-right-radius: 8px;
            padding: 10px;
            background: #f5f5fa;
            color: #889;
          }
          .bottom-btn:hover {
            color: #667;
            border-color: #ccd;
            background: #eeeef5;
          }
        </style>
      `
        }
      })
    }

    function getDriveTitle (info) {
      return info.title || 'Untitled'
    }

    function getGlobalSavedConfig (name, fallback = undefined) {
      var value = localStorage.getItem(`setting:${name}`);
      if (value === null) return fallback
      return value
    }

    function setGlobalSavedConfig (name, value) {
      localStorage.setItem(`setting:${name}`, value);
    }

    function getSavedConfig (name, fallback = undefined) {
      var value = localStorage.getItem(`setting:${name}:${getPath()}`);
      if (value === null) return getGlobalSavedConfig (name, fallback)
      return value
    }

    function setSavedConfig (name, value) {
      localStorage.setItem(`setting:${name}:${getPath()}`, value);
    }

    function oneof (v, values) {
      if (values.includes(v)) return v
    }

    function getVFCfg (obj, key, values) {
      if (!obj) return undefined
      const ns = 'unwalled.garden/explorer-view';
      if (obj[ns] && typeof obj[ns] === 'object') {
        return oneof(obj[ns][key], values)
      }
    }

    function validateViewfile (view) {
      if (typeof view.viewfile !== 'number' || view.viewfile < 1) {
        throw new Error('Unrecognized version ("viewfile" attribute): ' + view.viewfile)
      }
      if (!view.query || typeof view.query !== 'object') {
        throw new Error('No "query" is specified in the viewfile')
      }
      if (!view.query.path) {
        throw new Error('No "query.path" is specified in the viewfile')
      }
      if (Array.isArray(view.query.path)) {
        if (!view.query.path.every(p => typeof p === 'string')) {
          throw new Error('The "query.path" includes invalid (non-string) values')
        }
      } else if (typeof view.query.path !== 'string') {
        throw new Error('The "query.path" is invalid (it must be a string or array of strings)')
      }
    }

    const cssStr$2 = css`
body {
  /* common simple colors */
  --red: rgb(255, 59, 48);
  --orange: rgb(255, 149, 0);
  --yellow: rgb(255, 204, 0);
  --lime: #E6EE9C;
  --green: rgb(76, 217, 100);
  --teal: rgb(90, 200, 250);
  --blue: #2864dc;
  --purple: rgb(88, 86, 214);
  --pink: rgb(255, 45, 85);

  /* common element colors */
  --color-text: #333;
  --color-text--muted: gray;
  --color-text--light: #aaa;
  --color-text--dark: #111;
  --color-link: #295fcb;
  --color-focus-box-shadow: rgba(41, 95, 203, 0.8);
  --border-color: #d4d7dc;
  --light-border-color: #e4e7ec;
}
`;

    const cssStr$3 = css`
/**
 * New button styles
 * We should replace buttons.css with this
 */
${cssStr$2}

button {
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  box-shadow: 0 1px 1px rgba(0,0,0,.05);
  padding: 5px 10px;
  color: #333;
  outline: 0;
  cursor: pointer;
}

button:hover {
  background: #f5f5f5;
}

button:active {
  background: #eee;
}

button.big {
  padding: 6px 12px;
}

button.block {
  display: block;
  width: 100%;
}

button.pressed {
  box-shadow: inset 0 1px 1px rgba(0,0,0,.5);
  background: #6d6d79;
  color: rgba(255,255,255,1);
  border-color: transparent;
  border-radius: 4px;
}

button.primary {
  background: #5289f7;
  border-color: var(--blue);
  color: #fff;
  box-shadow: 0 1px 1px rgba(0,0,0,.1);
}

button.primary:hover {
  background: rgb(73, 126, 234);
}

button.gray {
  background: #fafafa;
}

button.gray:hover {
  background: #f5f5f5;
}

button[disabled] {
  border-color: var(--border-color);
  background: #fff;
  color: #999;
  cursor: default;
}

button.rounded {
  border-radius: 16px;
}

button.flat {
  box-shadow: none; 
}

button.noborder {
  border-color: transparent;
}

button.transparent {
  background: transparent;
  border-color: transparent;
  box-shadow: none; 
}

button.transparent:hover {
  background: #f5f5fa;
}

button.transparent.pressed {
  background: rgba(0,0,0,.1);
  box-shadow: inset 0 1px 2px rgba(0,0,0,.25);
  color: inherit;
}

.radio-group button {
  background: transparent;
  border: 0;
  box-shadow: none;
}

.radio-group button.pressed {
  background: #6d6d79;
  border-radius: 30px;
}

.btn-group {
  display: inline-flex;
}

.btn-group button {
  border-radius: 0;
  border-right-width: 0;
}

.btn-group button:first-child {
  border-top-left-radius: 3px;
  border-bottom-left-radius: 3px;
}

.btn-group button:last-child {
  border-top-right-radius: 3px;
  border-bottom-right-radius: 3px;
  border-right-width: 1px;
}

.btn-group.rounded button:first-child {
  border-top-left-radius: 14px;
  border-bottom-left-radius: 14px;
  padding-left: 14px;
}

.btn-group.rounded button:last-child {
  border-top-right-radius: 14px;
  border-bottom-right-radius: 14px;
  padding-right: 14px;
}
`;

    const cssStr$4 = css`
textarea {
  line-height: 1.4;
}

input,
textarea {
  height: 30px;
  padding: 0 7px;
  border-radius: 4px;
  color: rgba(51, 51, 51, 0.95);
  border: 1px solid #d9d9d9;
}
textarea {
  padding: 7px;
}

input[type="checkbox"],
textarea[type="checkbox"],
input[type="radio"],
textarea[type="radio"],
input[type="range"],
textarea[type="range"] {
  padding: 0;
}

input[type="checkbox"]:focus,
textarea[type="checkbox"]:focus,
input[type="radio"]:focus,
textarea[type="radio"]:focus,
input[type="range"]:focus,
textarea[type="range"]:focus {
  box-shadow: none;
}

input[type="radio"],
textarea[type="radio"] {
  width: 14px;
  height: 14px;
  outline: none;
  -webkit-appearance: none;
  border-radius: 50%;
  cursor: pointer;
  transition: border 0.1s ease;
}

input[type="radio"]:hover,
textarea[type="radio"]:hover {
  border: 1px solid var(--color-blue);
}

input[type="radio"]:checked,
textarea[type="radio"]:checked {
  border: 4.5px solid var(--color-blue);
}

input[type="file"],
textarea[type="file"] {
  padding: 0;
  border: 0;
  line-height: 1;
}

input[type="file"]:focus,
textarea[type="file"]:focus {
  border: 0;
  box-shadow: none;
}

input:focus,
textarea:focus,
select:focus {
  outline: 0;
  border: 1px solid rgba(41, 95, 203, 0.8);
  box-shadow: 0 0 0 2px rgba(41, 95, 203, 0.2);
}

input.error,
textarea.error,
select.error {
  border: 1px solid rgba(209, 48, 39, 0.75);
}

input.error:focus,
textarea.error:focus,
select.error:focus {
  box-shadow: 0 0 0 2px rgba(204, 47, 38, 0.15);
}

input.nofocus:focus,
textarea.nofocus:focus,
select.nofocus:focus {
  outline: 0;
  box-shadow: none;
  border: initial;
}

input.inline {
  height: auto;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  cursor: text;
  padding: 3px 5px;
  line-height: 1;
}

input.big,
textarea.big {
  height: 38px;
  padding: 0 10px;
  font-size: 14px;
}

textarea.big {
  padding: 5px 10px;
}

input.huge,
textarea.huge {
  height: 40px;
  padding: 0 10px;
  font-size: 18px;
}

textarea.huge {
  padding: 5px 10px;
}

input.inline:focus,
input.inline:hover {
  border: 1px solid #ccc;
  box-shadow: none;
}

input.inline:focus {
  background: #fff;
}

.input-file-picker {
  display: flex;
  align-items: center;
  padding: 3px;
  border-radius: 2px;
  border: 1px solid #d9d9d9;
  color: var(--color-text--muted);
}

.input-file-picker span {
  flex: 1;
  padding-left: 3px;
}

::-webkit-input-placeholder {
  color: rgba(0, 0, 0, 0.5);
  font-size: 0.8rem;
}

.big::-webkit-input-placeholder,
.huge::-webkit-input-placeholder {
  font-size: 0.9em;
}

label {
  font-weight: 500;
}

input[disabled][data-tooltip],
label[disabled][data-tooltip] {
  cursor: help;
}

input[disabled][data-tooltip] *,
label[disabled][data-tooltip] * {
  cursor: help;
}

label.required:after {
  content: '*';
  color: red;
}

.toggle {
  display: flex;
  align-items: center;
  flex-direction: row;
  margin-bottom: 10px;
  cursor: pointer;
  overflow: initial;
}

.toggle .switch {
  margin-right: 10px;
}

.toggle * {
  cursor: pointer;
}

.toggle.disabled {
  cursor: default;
}

.toggle.disabled * {
  cursor: default;
}

.toggle input {
  display: none;
}

.toggle .text {
  font-weight: 400;
}

.toggle .switch {
  display: inline-block;
  position: relative;
  width: 32px;
  height: 17px;
}

.toggle .switch:before,
.toggle .switch:after {
  position: absolute;
  display: block;
  content: '';
}

.toggle .switch:before {
  width: 100%;
  height: 100%;
  border-radius: 40px;
  background: #dadada;
}

.toggle .switch:after {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  left: 3px;
  top: 3px;
  background: #fafafa;
  transition: transform 0.15s ease;
}

.toggle input:checked:not(:disabled) + .switch:before {
  background: #41b855;
}

.toggle input:checked:not(:disabled) + .switch:after {
  transform: translateX(15px);
}

.toggle.disabled {
  color: var(--color-text--light);
}

label.checkbox-container {
  display: flex;
  align-items: center;
  height: 15px;
  font-weight: 400;
}

label.checkbox-container input[type="checkbox"] {
  width: 15px;
  height: 15px;
  margin: 0 5px 0 0;
}


`;

    const cssStr$5 = css`
*[data-tooltip] {
  position: relative;
}

*[data-tooltip]:hover:before,
*[data-tooltip]:hover:after {
  display: block;
  z-index: 1000;
  transition: opacity 0.01s ease;
  transition-delay: 0.2s;
}

*[data-tooltip]:hover:after {
  opacity: 1;
}

*[data-tooltip]:hover:before {
  transform: translate(-50%, 0);
  opacity: 1;
}

*[data-tooltip]:before {
  opacity: 0;
  transform: translate(-50%, 0);
  position: absolute;
  top: 33px;
  left: 50%;
  z-index: 3000;
  content: attr(data-tooltip);
  background: rgba(17, 17, 17, 0.95);
  font-size: 0.7rem;
  border: 0;
  border-radius: 4px;
  padding: 7px 10px;
  color: rgba(255, 255, 255, 0.925);
  text-transform: none;
  text-align: center;
  font-weight: 500;
  white-space: pre;
  line-height: 1;
  pointer-events: none;
}

*[data-tooltip]:after {
  opacity: 0;
  position: absolute;
  left: calc(50% - 6px);
  top: 28px;
  content: '';
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid rgba(17, 17, 17, 0.95);
  pointer-events: none;
}

.tooltip-nodelay[data-tooltip]:hover:before,
.tooltip-nodelay[data-tooltip]:hover:after {
  transition-delay: initial;
}

.tooltip-right[data-tooltip]:before {
  top: 50%;
  left: calc(100% + 6px);
  transform: translate(0, -50%);
  line-height: 0.9;
}

.tooltip-right[data-tooltip]:after {
  top: 50%;
  left: calc(100% + 0px);
  transform: translate(0, -50%);
  border: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 6px solid rgba(17, 17, 17, 0.95);
}

.tooltip-left[data-tooltip]:before {
  top: 50%;
  left: auto;
  right: calc(100% + 6px);
  transform: translate(0, -50%);
  line-height: 0.9;
}

.tooltip-left[data-tooltip]:after {
  top: 50%;
  left: auto;
  right: calc(100% + 0px);
  transform: translate(0, -50%);
  border: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 6px solid rgba(17, 17, 17, 0.95);
}
`;

    const cssStr$6 = css`
.fa-mod {
  position: relative;
  margin-right: 3px;
}

.fa-mod :last-child {
  position: absolute;
  font-size: 50%;
  top: 42%;
  right: 4px;
}
`;

    const cssStr$7 = css`
.spinner {
  display: inline-block;
  height: 14px;
  width: 14px;
  animation: rotate 1s infinite linear;
  color: #aaa;
  border: 1.5px solid;
  border-right-color: transparent;
  border-radius: 50%;
  transition: color 0.25s;
}

.spinner.reverse {
  animation: rotate 2s infinite linear reverse;
}

@keyframes rotate {
  0%    { transform: rotate(0deg); }
  100%  { transform: rotate(360deg); }
}
`;

    const cssStr$8 = css`
${cssStr$3}
${cssStr$4}
${cssStr$5}
${cssStr$6}
${cssStr$7}

:host {
  --bg-color: #f1f1f6;
  --bg-color--light: #f8f8fc;
  --bg-color--dark: #e2e2ee;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

table {
  font-size: inherit;
  color: inherit;
}

.link {
  color: var(--blue);
}

.label {
  display: inline-block;
  background: var(--bg-color);
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 10px;
  font-weight: 500;
}

.label.verified {
  color: #2196F3;
  background: #e6f1ff;
}

.menubar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  background: #fff;
  z-index: 3;
}

.layout {
  height: 100vh;
  overflow: auto;
}

main {
  margin: 0px 370px 0px 300px;
  position: relative;
}

.hide-nav-left main { margin-left: 16px; }
.hide-nav-right main { margin-right: 16px; }

.loading-view {
  background: var(--bg-color--light);
  padding: 40px;
  margin: 20px;
  border-radius: 8px;
  color: #667;
  font-size: 14px;
  opacity: 0;
  transition: opacity 1s;
}

.loading-view > div {
  display: flex;
  align-items: center;
}

.loading-view.visible {
  opacity: 1;
}

.loading-view .spinner {
  margin-right: 10px;
  color: #778;
}

.loading-notice {
  position: absolute;
  top: 40px;
  right: 0;
  z-index: 10;
  padding: 5px 10px;
  background: #fffa;
  border-radius: 4px;
  border: 1px solid #ddd;
  box-shadow: 0 1px 3px #0002;
}

.error-view {
  background: #fee;
  padding: 40px;
  margin: 20px;
  border-radius: 8px;
  color: #c55;
  font-size: 16px;
  line-height: 32px;
}

main .error-view {
  margin: 4px 0;
}

.error-view .error-title {
  font-size: 27px;
  line-height: 50px;
}

.error-view summary {
  font-weight: bold;
}

.error-view pre {
  background: #fffa;
  line-height: 1;
  padding: 10px;
  border-radius: 4px;
}

.nav-toggle {
  position: fixed;
  top: 0px;
  width: 20px;
  height: 100vh;
  padding: 50vh 2px 0;
  box-sizing: border-box;
  z-index: 3;
}
.nav-toggle:hover {
  cursor: pointer;
  background: rgba(0, 0, 0, .08);
}
.nav-toggle span { display: none; }
.nav-toggle:hover span { display: inline; }
.nav-toggle.left { left: 0; }
.nav-toggle.right { right: 0; text-align: right; }

nav {
  position: fixed;
  z-index: 2;
  top: 4px;
  width: 270px;
  height: 100vh;
  box-sizing: border-box;
  background: var(--bg-color);
  padding: 10px;
  overflow-y: auto;
}

nav.left {
  left: 0px;
}

nav.right {
  right: 0px;
  width: 360px;
  border-top-left-radius: 8px;
}

nav section h1,
nav section h2 {
  display: flex;
  align-items: center;
  margin: 0 0 10px;
}

nav section h1 {
  font-size: 1.5em;
}

nav section h2 {
  font-size: 1.35em;
}

nav section h3,
nav section h4,
nav section h5 {
  margin: 0;
}

nav h4 code {
  word-break: break-word;
}

nav img {
  display: inline-block;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  margin-right: 10px;
}

nav a {
  color: inherit;
}

nav p {
  margin: 10px 0;
}

nav code {
  word-break: break-all;
}

nav button {
  border-radius: 6px;
}

nav button .fa-caret-down {
  margin-left: 2px;
}

nav section {
  display: block;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  width: 100%;
  box-sizing: border-box;
  border: 0;
  box-shadow: none;
  font-size: 12px;
}

nav section section {
  border: 1px solid #dde;
  margin: 0;
}

nav section > :first-child {
  margin-top: 0;
}

nav section > :last-child {
  margin-bottom: 0;
}

nav section.transparent {
  background: transparent;
}

nav file-display {
  max-height: 360px;
  overflow: hidden;
}

nav selection-info[full-view] file-display {
  max-height: none;
}

nav section .bottom-ctrls {
  margin: 0 -8px -8px;
  border-top: 1px solid #eef;
  padding-top: 4px;
}

nav section .bottom-ctrls a.btn {
  display: inline-block;
  padding: 4px;
  text-decoration: none;
  margin: 0 6px;
  font-size: 11px;
  border-radius: 4px;
}

nav section .bottom-ctrls a.btn:hover {
  background: rgb(245, 245, 250);
}

nav .facts {
  line-height: 1.6;
}

nav .facts > span {
  display: inline-block;
  white-space: nowrap;
  margin-right: 5px;
}

nav .help {
 background: transparent;
 border: 1px solid #b7b7d0;
 color: #85859e;
}

nav .help table {
  width: 100%;
}

nav .help table tr:not(:last-child) td {
  padding-bottom: 5px;
}

nav .help table td:first-child {
  width: 18px;
  text-align: center;
}

nav .help table td:first-child span {
  margin-left: -6px;
}

nav .help input {
  height: 22px;
  width: 100%;
  border-radius: 10px;
  background: #e1e1e8;
  color: #778;
  border: 0;
  text-overflow: ellipsis;
}

.header {
  position: sticky;
  z-index: 2;
  top: 0px;
  display: flex;
  align-items: center;
  margin: 0px -4px;
  font-size: 12px;
  color: #556;
  background: #fff;
  padding: 5px 0 5px 5px;
  user-select: none;
  white-space: nowrap;
}

.header > *:not(:last-child) {
  margin-right: 5px;
}

.header .date {
  color: #99a;
}

.header .spacer {
  flex: 1;
}

.header button {
  padding: 4px 6px;
  font-size: 10px;
  white-space: nowrap;
}

.header button.labeled-btn {
  padding: 5px 10px 5px 12px;
  border-radius: 12px;
  font-size: 10px;
}

.header button.active {
  background: #eef;
}

.header .drag-hover,
.header .drop-target {
  background: #f5f5ff !important;
  outline: rgb(191, 191, 243) dashed 1px;
}

.header .drag-hover * {
  pointer-events: none;
}

.header path-ancestry {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  align-items: baseline;
}

.header path-ancestry::-webkit-scrollbar {
  display: none;
}

.header path-ancestry a {
}

.header path-ancestry .author {
  font-weight: 500;
  color: inherit;
}

.header path-ancestry .name {
  color: inherit;
}

.header path-ancestry .fa-angle-right {
  margin: 0 2px;
}

`;

    const cssStr$9 = css`
:host {
  display: block;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.content {
  margin: 10px 0px 14px;
  border: 1px solid #ccd;
  border-radius: 4px;
}

file-display {
  --text-padding: 14px 14px 18px;
  --text-background: #fff;
  --text-max-width: 60em;
  --media-padding: 14px 14px 18px;
}

`;

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const _state = new WeakMap();
    /**
     * Renders one of a series of values, including Promises, to a Part.
     *
     * Values are rendered in priority order, with the first argument having the
     * highest priority and the last argument having the lowest priority. If a
     * value is a Promise, low-priority values will be rendered until it resolves.
     *
     * The priority of values can be used to create placeholder content for async
     * data. For example, a Promise with pending content can be the first,
     * highest-priority, argument, and a non_promise loading indicator template can
     * be used as the second, lower-priority, argument. The loading indicator will
     * render immediately, and the primary content will render when the Promise
     * resolves.
     *
     * Example:
     *
     *     const content = fetch('./content.txt').then(r => r.text());
     *     html`${until(content, html`<span>Loading...</span>`)}`
     */
    const until = directive((...args) => (part) => {
        let state = _state.get(part);
        if (state === undefined) {
            state = {
                values: [],
            };
            _state.set(part, state);
        }
        const previousValues = state.values;
        state.values = args;
        for (let i = 0; i < args.length; i++) {
            // If we've rendered a higher-priority value already, stop.
            if (state.lastRenderedIndex !== undefined && i > state.lastRenderedIndex) {
                break;
            }
            const value = args[i];
            // Render non-Promise values immediately
            if (isPrimitive(value) ||
                typeof value.then !== 'function') {
                part.setValue(value);
                state.lastRenderedIndex = i;
                // Since a lower-priority value will never overwrite a higher-priority
                // synchronous value, we can stop processsing now.
                break;
            }
            // If this is a Promise we've already handled, skip it.
            if (state.lastRenderedIndex !== undefined &&
                typeof value.then === 'function' &&
                value === previousValues[i]) {
                continue;
            }
            // We have a Promise that we haven't seen before, so priorities may have
            // changed. Forget what we rendered before.
            state.lastRenderedIndex = undefined;
            Promise.resolve(value).then((resolvedValue) => {
                const index = state.values.indexOf(value);
                // If state.values doesn't contain the value, we've re-rendered without
                // the value, so don't render it. Then, only render if the value is
                // higher-priority than what's already been rendered.
                if (index > -1 &&
                    (state.lastRenderedIndex === undefined ||
                        index < state.lastRenderedIndex)) {
                    state.lastRenderedIndex = index;
                    part.setValue(resolvedValue);
                    part.commit();
                }
            });
        }
    });

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // For each part, remember the value that was last rendered to the part by the
    // unsafeHTML directive, and the DocumentFragment that was last set as a value.
    // The DocumentFragment is used as a unique key to check if the last value
    // rendered to the part was with unsafeHTML. If not, we'll always re-render the
    // value passed to unsafeHTML.
    const previousValues = new WeakMap();
    /**
     * Renders the result as HTML, rather than text.
     *
     * Note, this is unsafe to use with any user-provided input that hasn't been
     * sanitized or escaped, as it may lead to cross-site-scripting
     * vulnerabilities.
     */
    const unsafeHTML = directive((value) => (part) => {
        if (!(part instanceof NodePart)) {
            throw new Error('unsafeHTML can only be used in text bindings');
        }
        const previousValue = previousValues.get(part);
        if (previousValue !== undefined && isPrimitive(value) &&
            value === previousValue.value && part.value === previousValue.fragment) {
            return;
        }
        const template = document.createElement('template');
        template.innerHTML = value; // innerHTML casts to string internally
        const fragment = document.importNode(template.content, true);
        part.setValue(fragment);
        previousValues.set(part, { value, fragment });
    });

    /*! markdown-it 10.0.0 https://github.com//markdown-it/markdown-it @license MIT */
    const define = (function(){return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t);}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

    /*eslint quotes:0*/
    module.exports = require('entities/lib/maps/entities.json');

    },{"entities/lib/maps/entities.json":52}],2:[function(require,module,exports){


    module.exports = [
      'address',
      'article',
      'aside',
      'base',
      'basefont',
      'blockquote',
      'body',
      'caption',
      'center',
      'col',
      'colgroup',
      'dd',
      'details',
      'dialog',
      'dir',
      'div',
      'dl',
      'dt',
      'fieldset',
      'figcaption',
      'figure',
      'footer',
      'form',
      'frame',
      'frameset',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'head',
      'header',
      'hr',
      'html',
      'iframe',
      'legend',
      'li',
      'link',
      'main',
      'menu',
      'menuitem',
      'meta',
      'nav',
      'noframes',
      'ol',
      'optgroup',
      'option',
      'p',
      'param',
      'section',
      'source',
      'summary',
      'table',
      'tbody',
      'td',
      'tfoot',
      'th',
      'thead',
      'title',
      'tr',
      'track',
      'ul'
    ];

    },{}],3:[function(require,module,exports){

    var attr_name     = '[a-zA-Z_:][a-zA-Z0-9:._-]*';

    var unquoted      = '[^"\'=<>`\\x00-\\x20]+';
    var single_quoted = "'[^']*'";
    var double_quoted = '"[^"]*"';

    var attr_value  = '(?:' + unquoted + '|' + single_quoted + '|' + double_quoted + ')';

    var attribute   = '(?:\\s+' + attr_name + '(?:\\s*=\\s*' + attr_value + ')?)';

    var open_tag    = '<[A-Za-z][A-Za-z0-9\\-]*' + attribute + '*\\s*\\/?>';

    var close_tag   = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>';
    var comment     = '<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->';
    var processing  = '<[?].*?[?]>';
    var declaration = '<![A-Z]+\\s+[^>]*>';
    var cdata       = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';

    var HTML_TAG_RE = new RegExp('^(?:' + open_tag + '|' + close_tag + '|' + comment +
                            '|' + processing + '|' + declaration + '|' + cdata + ')');
    var HTML_OPEN_CLOSE_TAG_RE = new RegExp('^(?:' + open_tag + '|' + close_tag + ')');

    module.exports.HTML_TAG_RE = HTML_TAG_RE;
    module.exports.HTML_OPEN_CLOSE_TAG_RE = HTML_OPEN_CLOSE_TAG_RE;

    },{}],4:[function(require,module,exports){


    function _class(obj) { return Object.prototype.toString.call(obj); }

    function isString(obj) { return _class(obj) === '[object String]'; }

    var _hasOwnProperty = Object.prototype.hasOwnProperty;

    function has(object, key) {
      return _hasOwnProperty.call(object, key);
    }

    // Merge objects
    //
    function assign(obj /*from1, from2, from3, ...*/) {
      var sources = Array.prototype.slice.call(arguments, 1);

      sources.forEach(function (source) {
        if (!source) { return; }

        if (typeof source !== 'object') {
          throw new TypeError(source + 'must be object');
        }

        Object.keys(source).forEach(function (key) {
          obj[key] = source[key];
        });
      });

      return obj;
    }

    // Remove element from array and put another array at those position.
    // Useful for some operations with tokens
    function arrayReplaceAt(src, pos, newElements) {
      return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
    }

    ////////////////////////////////////////////////////////////////////////////////

    function isValidEntityCode(c) {
      /*eslint no-bitwise:0*/
      // broken sequence
      if (c >= 0xD800 && c <= 0xDFFF) { return false; }
      // never used
      if (c >= 0xFDD0 && c <= 0xFDEF) { return false; }
      if ((c & 0xFFFF) === 0xFFFF || (c & 0xFFFF) === 0xFFFE) { return false; }
      // control codes
      if (c >= 0x00 && c <= 0x08) { return false; }
      if (c === 0x0B) { return false; }
      if (c >= 0x0E && c <= 0x1F) { return false; }
      if (c >= 0x7F && c <= 0x9F) { return false; }
      // out of range
      if (c > 0x10FFFF) { return false; }
      return true;
    }

    function fromCodePoint(c) {
      /*eslint no-bitwise:0*/
      if (c > 0xffff) {
        c -= 0x10000;
        var surrogate1 = 0xd800 + (c >> 10),
            surrogate2 = 0xdc00 + (c & 0x3ff);

        return String.fromCharCode(surrogate1, surrogate2);
      }
      return String.fromCharCode(c);
    }


    var UNESCAPE_MD_RE  = /\\([!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~])/g;
    var ENTITY_RE       = /&([a-z#][a-z0-9]{1,31});/gi;
    var UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + '|' + ENTITY_RE.source, 'gi');

    var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))/i;

    var entities = require('./entities');

    function replaceEntityPattern(match, name) {
      var code = 0;

      if (has(entities, name)) {
        return entities[name];
      }

      if (name.charCodeAt(0) === 0x23/* # */ && DIGITAL_ENTITY_TEST_RE.test(name)) {
        code = name[1].toLowerCase() === 'x' ?
          parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);

        if (isValidEntityCode(code)) {
          return fromCodePoint(code);
        }
      }

      return match;
    }

    /*function replaceEntities(str) {
      if (str.indexOf('&') < 0) { return str; }

      return str.replace(ENTITY_RE, replaceEntityPattern);
    }*/

    function unescapeMd(str) {
      if (str.indexOf('\\') < 0) { return str; }
      return str.replace(UNESCAPE_MD_RE, '$1');
    }

    function unescapeAll(str) {
      if (str.indexOf('\\') < 0 && str.indexOf('&') < 0) { return str; }

      return str.replace(UNESCAPE_ALL_RE, function (match, escaped, entity) {
        if (escaped) { return escaped; }
        return replaceEntityPattern(match, entity);
      });
    }

    ////////////////////////////////////////////////////////////////////////////////

    var HTML_ESCAPE_TEST_RE = /[&<>"]/;
    var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
    var HTML_REPLACEMENTS = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    };

    function replaceUnsafeChar(ch) {
      return HTML_REPLACEMENTS[ch];
    }

    function escapeHtml(str) {
      if (HTML_ESCAPE_TEST_RE.test(str)) {
        return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
      }
      return str;
    }

    ////////////////////////////////////////////////////////////////////////////////

    var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;

    function escapeRE(str) {
      return str.replace(REGEXP_ESCAPE_RE, '\\$&');
    }

    ////////////////////////////////////////////////////////////////////////////////

    function isSpace(code) {
      switch (code) {
        case 0x09:
        case 0x20:
          return true;
      }
      return false;
    }

    // Zs (unicode class) || [\t\f\v\r\n]
    function isWhiteSpace(code) {
      if (code >= 0x2000 && code <= 0x200A) { return true; }
      switch (code) {
        case 0x09: // \t
        case 0x0A: // \n
        case 0x0B: // \v
        case 0x0C: // \f
        case 0x0D: // \r
        case 0x20:
        case 0xA0:
        case 0x1680:
        case 0x202F:
        case 0x205F:
        case 0x3000:
          return true;
      }
      return false;
    }

    ////////////////////////////////////////////////////////////////////////////////

    /*eslint-disable max-len*/
    var UNICODE_PUNCT_RE = require('uc.micro/categories/P/regex');

    // Currently without astral characters support.
    function isPunctChar(ch) {
      return UNICODE_PUNCT_RE.test(ch);
    }


    // Markdown ASCII punctuation characters.
    //
    // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
    // http://spec.commonmark.org/0.15/#ascii-punctuation-character
    //
    // Don't confuse with unicode punctuation !!! It lacks some chars in ascii range.
    //
    function isMdAsciiPunct(ch) {
      switch (ch) {
        case 0x21/* ! */:
        case 0x22/* " */:
        case 0x23/* # */:
        case 0x24/* $ */:
        case 0x25/* % */:
        case 0x26/* & */:
        case 0x27/* ' */:
        case 0x28/* ( */:
        case 0x29/* ) */:
        case 0x2A/* * */:
        case 0x2B/* + */:
        case 0x2C/* , */:
        case 0x2D/* - */:
        case 0x2E/* . */:
        case 0x2F/* / */:
        case 0x3A/* : */:
        case 0x3B/* ; */:
        case 0x3C/* < */:
        case 0x3D/* = */:
        case 0x3E/* > */:
        case 0x3F/* ? */:
        case 0x40/* @ */:
        case 0x5B/* [ */:
        case 0x5C/* \ */:
        case 0x5D/* ] */:
        case 0x5E/* ^ */:
        case 0x5F/* _ */:
        case 0x60/* ` */:
        case 0x7B/* { */:
        case 0x7C/* | */:
        case 0x7D/* } */:
        case 0x7E/* ~ */:
          return true;
        default:
          return false;
      }
    }

    // Hepler to unify [reference labels].
    //
    function normalizeReference(str) {
      // Trim and collapse whitespace
      //
      str = str.trim().replace(/\s+/g, ' ');

      // In node v10 'ẞ'.toLowerCase() === 'Ṿ', which is presumed to be a bug
      // fixed in v12 (couldn't find any details).
      //
      // So treat this one as a special case
      // (remove this when node v10 is no longer supported).
      //
      if ('ẞ'.toLowerCase() === 'Ṿ') {
        str = str.replace(/ẞ/g, 'ß');
      }

      // .toLowerCase().toUpperCase() should get rid of all differences
      // between letter variants.
      //
      // Simple .toLowerCase() doesn't normalize 125 code points correctly,
      // and .toUpperCase doesn't normalize 6 of them (list of exceptions:
      // İ, ϴ, ẞ, Ω, K, Å - those are already uppercased, but have differently
      // uppercased versions).
      //
      // Here's an example showing how it happens. Lets take greek letter omega:
      // uppercase U+0398 (Θ), U+03f4 (ϴ) and lowercase U+03b8 (θ), U+03d1 (ϑ)
      //
      // Unicode entries:
      // 0398;GREEK CAPITAL LETTER THETA;Lu;0;L;;;;;N;;;;03B8;
      // 03B8;GREEK SMALL LETTER THETA;Ll;0;L;;;;;N;;;0398;;0398
      // 03D1;GREEK THETA SYMBOL;Ll;0;L;<compat> 03B8;;;;N;GREEK SMALL LETTER SCRIPT THETA;;0398;;0398
      // 03F4;GREEK CAPITAL THETA SYMBOL;Lu;0;L;<compat> 0398;;;;N;;;;03B8;
      //
      // Case-insensitive comparison should treat all of them as equivalent.
      //
      // But .toLowerCase() doesn't change ϑ (it's already lowercase),
      // and .toUpperCase() doesn't change ϴ (already uppercase).
      //
      // Applying first lower then upper case normalizes any character:
      // '\u0398\u03f4\u03b8\u03d1'.toLowerCase().toUpperCase() === '\u0398\u0398\u0398\u0398'
      //
      // Note: this is equivalent to unicode case folding; unicode normalization
      // is a different step that is not required here.
      //
      // Final result should be uppercased, because it's later stored in an object
      // (this avoid a conflict with Object.prototype members,
      // most notably, `__proto__`)
      //
      return str.toLowerCase().toUpperCase();
    }

    ////////////////////////////////////////////////////////////////////////////////

    // Re-export libraries commonly used in both markdown-it and its plugins,
    // so plugins won't have to depend on them explicitly, which reduces their
    // bundled size (e.g. a browser build).
    //
    exports.lib                 = {};
    exports.lib.mdurl           = require('mdurl');
    exports.lib.ucmicro         = require('uc.micro');

    exports.assign              = assign;
    exports.isString            = isString;
    exports.has                 = has;
    exports.unescapeMd          = unescapeMd;
    exports.unescapeAll         = unescapeAll;
    exports.isValidEntityCode   = isValidEntityCode;
    exports.fromCodePoint       = fromCodePoint;
    // exports.replaceEntities     = replaceEntities;
    exports.escapeHtml          = escapeHtml;
    exports.arrayReplaceAt      = arrayReplaceAt;
    exports.isSpace             = isSpace;
    exports.isWhiteSpace        = isWhiteSpace;
    exports.isMdAsciiPunct      = isMdAsciiPunct;
    exports.isPunctChar         = isPunctChar;
    exports.escapeRE            = escapeRE;
    exports.normalizeReference  = normalizeReference;

    },{"./entities":1,"mdurl":58,"uc.micro":65,"uc.micro/categories/P/regex":63}],5:[function(require,module,exports){


    exports.parseLinkLabel       = require('./parse_link_label');
    exports.parseLinkDestination = require('./parse_link_destination');
    exports.parseLinkTitle       = require('./parse_link_title');

    },{"./parse_link_destination":6,"./parse_link_label":7,"./parse_link_title":8}],6:[function(require,module,exports){


    var unescapeAll = require('../common/utils').unescapeAll;


    module.exports = function parseLinkDestination(str, pos, max) {
      var code, level,
          lines = 0,
          start = pos,
          result = {
            ok: false,
            pos: 0,
            lines: 0,
            str: ''
          };

      if (str.charCodeAt(pos) === 0x3C /* < */) {
        pos++;
        while (pos < max) {
          code = str.charCodeAt(pos);
          if (code === 0x0A /* \n */) { return result; }
          if (code === 0x3E /* > */) {
            result.pos = pos + 1;
            result.str = unescapeAll(str.slice(start + 1, pos));
            result.ok = true;
            return result;
          }
          if (code === 0x5C /* \ */ && pos + 1 < max) {
            pos += 2;
            continue;
          }

          pos++;
        }

        // no closing '>'
        return result;
      }

      // this should be ... } else { ... branch

      level = 0;
      while (pos < max) {
        code = str.charCodeAt(pos);

        if (code === 0x20) { break; }

        // ascii control characters
        if (code < 0x20 || code === 0x7F) { break; }

        if (code === 0x5C /* \ */ && pos + 1 < max) {
          pos += 2;
          continue;
        }

        if (code === 0x28 /* ( */) {
          level++;
        }

        if (code === 0x29 /* ) */) {
          if (level === 0) { break; }
          level--;
        }

        pos++;
      }

      if (start === pos) { return result; }
      if (level !== 0) { return result; }

      result.str = unescapeAll(str.slice(start, pos));
      result.lines = lines;
      result.pos = pos;
      result.ok = true;
      return result;
    };

    },{"../common/utils":4}],7:[function(require,module,exports){

    module.exports = function parseLinkLabel(state, start, disableNested) {
      var level, found, marker, prevPos,
          labelEnd = -1,
          max = state.posMax,
          oldPos = state.pos;

      state.pos = start + 1;
      level = 1;

      while (state.pos < max) {
        marker = state.src.charCodeAt(state.pos);
        if (marker === 0x5D /* ] */) {
          level--;
          if (level === 0) {
            found = true;
            break;
          }
        }

        prevPos = state.pos;
        state.md.inline.skipToken(state);
        if (marker === 0x5B /* [ */) {
          if (prevPos === state.pos - 1) {
            // increase level if we find text `[`, which is not a part of any token
            level++;
          } else if (disableNested) {
            state.pos = oldPos;
            return -1;
          }
        }
      }

      if (found) {
        labelEnd = state.pos;
      }

      // restore old state
      state.pos = oldPos;

      return labelEnd;
    };

    },{}],8:[function(require,module,exports){


    var unescapeAll = require('../common/utils').unescapeAll;


    module.exports = function parseLinkTitle(str, pos, max) {
      var code,
          marker,
          lines = 0,
          start = pos,
          result = {
            ok: false,
            pos: 0,
            lines: 0,
            str: ''
          };

      if (pos >= max) { return result; }

      marker = str.charCodeAt(pos);

      if (marker !== 0x22 /* " */ && marker !== 0x27 /* ' */ && marker !== 0x28 /* ( */) { return result; }

      pos++;

      // if opening marker is "(", switch it to closing marker ")"
      if (marker === 0x28) { marker = 0x29; }

      while (pos < max) {
        code = str.charCodeAt(pos);
        if (code === marker) {
          result.pos = pos + 1;
          result.lines = lines;
          result.str = unescapeAll(str.slice(start + 1, pos));
          result.ok = true;
          return result;
        } else if (code === 0x0A) {
          lines++;
        } else if (code === 0x5C /* \ */ && pos + 1 < max) {
          pos++;
          if (str.charCodeAt(pos) === 0x0A) {
            lines++;
          }
        }

        pos++;
      }

      return result;
    };

    },{"../common/utils":4}],9:[function(require,module,exports){


    var utils        = require('./common/utils');
    var helpers      = require('./helpers');
    var Renderer     = require('./renderer');
    var ParserCore   = require('./parser_core');
    var ParserBlock  = require('./parser_block');
    var ParserInline = require('./parser_inline');
    var LinkifyIt    = require('linkify-it');
    var mdurl        = require('mdurl');
    var punycode     = require('punycode');


    var config = {
      'default': require('./presets/default'),
      zero: require('./presets/zero'),
      commonmark: require('./presets/commonmark')
    };

    ////////////////////////////////////////////////////////////////////////////////
    //
    // This validator can prohibit more than really needed to prevent XSS. It's a
    // tradeoff to keep code simple and to be secure by default.
    //
    // If you need different setup - override validator method as you wish. Or
    // replace it with dummy function and use external sanitizer.
    //

    var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
    var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;

    function validateLink(url) {
      // url should be normalized at this point, and existing entities are decoded
      var str = url.trim().toLowerCase();

      return BAD_PROTO_RE.test(str) ? (GOOD_DATA_RE.test(str) ? true : false) : true;
    }

    ////////////////////////////////////////////////////////////////////////////////


    var RECODE_HOSTNAME_FOR = [ 'http:', 'https:', 'mailto:' ];

    function normalizeLink(url) {
      var parsed = mdurl.parse(url, true);

      if (parsed.hostname) {
        // Encode hostnames in urls like:
        // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
        //
        // We don't encode unknown schemas, because it's likely that we encode
        // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
        //
        if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
          try {
            parsed.hostname = punycode.toASCII(parsed.hostname);
          } catch (er) { /**/ }
        }
      }

      return mdurl.encode(mdurl.format(parsed));
    }

    function normalizeLinkText(url) {
      var parsed = mdurl.parse(url, true);

      if (parsed.hostname) {
        // Encode hostnames in urls like:
        // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
        //
        // We don't encode unknown schemas, because it's likely that we encode
        // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
        //
        if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
          try {
            parsed.hostname = punycode.toUnicode(parsed.hostname);
          } catch (er) { /**/ }
        }
      }

      return mdurl.decode(mdurl.format(parsed));
    }


    /**
     * class MarkdownIt
     *
     * Main parser/renderer class.
     *
     * ##### Usage
     *
     * ```javascript
     * // node.js, "classic" way:
     * var MarkdownIt = require('markdown-it'),
     *     md = new MarkdownIt();
     * var result = md.render('# markdown-it rulezz!');
     *
     * // node.js, the same, but with sugar:
     * var md = require('markdown-it')();
     * var result = md.render('# markdown-it rulezz!');
     *
     * // browser without AMD, added to "window" on script load
     * // Note, there are no dash.
     * var md = window.markdownit();
     * var result = md.render('# markdown-it rulezz!');
     * ```
     *
     * Single line rendering, without paragraph wrap:
     *
     * ```javascript
     * var md = require('markdown-it')();
     * var result = md.renderInline('__markdown-it__ rulezz!');
     * ```
     **/

    /**
     * new MarkdownIt([presetName, options])
     * - presetName (String): optional, `commonmark` / `zero`
     * - options (Object)
     *
     * Creates parser instanse with given config. Can be called without `new`.
     *
     * ##### presetName
     *
     * MarkdownIt provides named presets as a convenience to quickly
     * enable/disable active syntax rules and options for common use cases.
     *
     * - ["commonmark"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/commonmark.js) -
     *   configures parser to strict [CommonMark](http://commonmark.org/) mode.
     * - [default](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/default.js) -
     *   similar to GFM, used when no preset name given. Enables all available rules,
     *   but still without html, typographer & autolinker.
     * - ["zero"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/zero.js) -
     *   all rules disabled. Useful to quickly setup your config via `.enable()`.
     *   For example, when you need only `bold` and `italic` markup and nothing else.
     *
     * ##### options:
     *
     * - __html__ - `false`. Set `true` to enable HTML tags in source. Be careful!
     *   That's not safe! You may need external sanitizer to protect output from XSS.
     *   It's better to extend features via plugins, instead of enabling HTML.
     * - __xhtmlOut__ - `false`. Set `true` to add '/' when closing single tags
     *   (`<br />`). This is needed only for full CommonMark compatibility. In real
     *   world you will need HTML output.
     * - __breaks__ - `false`. Set `true` to convert `\n` in paragraphs into `<br>`.
     * - __langPrefix__ - `language-`. CSS language class prefix for fenced blocks.
     *   Can be useful for external highlighters.
     * - __linkify__ - `false`. Set `true` to autoconvert URL-like text to links.
     * - __typographer__  - `false`. Set `true` to enable [some language-neutral
     *   replacement](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/replacements.js) +
     *   quotes beautification (smartquotes).
     * - __quotes__ - `“”‘’`, String or Array. Double + single quotes replacement
     *   pairs, when typographer enabled and smartquotes on. For example, you can
     *   use `'«»„“'` for Russian, `'„“‚‘'` for German, and
     *   `['«\xA0', '\xA0»', '‹\xA0', '\xA0›']` for French (including nbsp).
     * - __highlight__ - `null`. Highlighter function for fenced code blocks.
     *   Highlighter `function (str, lang)` should return escaped HTML. It can also
     *   return empty string if the source was not changed and should be escaped
     *   externaly. If result starts with <pre... internal wrapper is skipped.
     *
     * ##### Example
     *
     * ```javascript
     * // commonmark mode
     * var md = require('markdown-it')('commonmark');
     *
     * // default mode
     * var md = require('markdown-it')();
     *
     * // enable everything
     * var md = require('markdown-it')({
     *   html: true,
     *   linkify: true,
     *   typographer: true
     * });
     * ```
     *
     * ##### Syntax highlighting
     *
     * ```js
     * var hljs = require('highlight.js') // https://highlightjs.org/
     *
     * var md = require('markdown-it')({
     *   highlight: function (str, lang) {
     *     if (lang && hljs.getLanguage(lang)) {
     *       try {
     *         return hljs.highlight(lang, str, true).value;
     *       } catch (__) {}
     *     }
     *
     *     return ''; // use external default escaping
     *   }
     * });
     * ```
     *
     * Or with full wrapper override (if you need assign class to `<pre>`):
     *
     * ```javascript
     * var hljs = require('highlight.js') // https://highlightjs.org/
     *
     * // Actual default values
     * var md = require('markdown-it')({
     *   highlight: function (str, lang) {
     *     if (lang && hljs.getLanguage(lang)) {
     *       try {
     *         return '<pre class="hljs"><code>' +
     *                hljs.highlight(lang, str, true).value +
     *                '</code></pre>';
     *       } catch (__) {}
     *     }
     *
     *     return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
     *   }
     * });
     * ```
     *
     **/
    function MarkdownIt(presetName, options) {
      if (!(this instanceof MarkdownIt)) {
        return new MarkdownIt(presetName, options);
      }

      if (!options) {
        if (!utils.isString(presetName)) {
          options = presetName || {};
          presetName = 'default';
        }
      }

      /**
       * MarkdownIt#inline -> ParserInline
       *
       * Instance of [[ParserInline]]. You may need it to add new rules when
       * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
       * [[MarkdownIt.enable]].
       **/
      this.inline = new ParserInline();

      /**
       * MarkdownIt#block -> ParserBlock
       *
       * Instance of [[ParserBlock]]. You may need it to add new rules when
       * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
       * [[MarkdownIt.enable]].
       **/
      this.block = new ParserBlock();

      /**
       * MarkdownIt#core -> Core
       *
       * Instance of [[Core]] chain executor. You may need it to add new rules when
       * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
       * [[MarkdownIt.enable]].
       **/
      this.core = new ParserCore();

      /**
       * MarkdownIt#renderer -> Renderer
       *
       * Instance of [[Renderer]]. Use it to modify output look. Or to add rendering
       * rules for new token types, generated by plugins.
       *
       * ##### Example
       *
       * ```javascript
       * var md = require('markdown-it')();
       *
       * function myToken(tokens, idx, options, env, self) {
       *   //...
       *   return result;
       * };
       *
       * md.renderer.rules['my_token'] = myToken
       * ```
       *
       * See [[Renderer]] docs and [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.js).
       **/
      this.renderer = new Renderer();

      /**
       * MarkdownIt#linkify -> LinkifyIt
       *
       * [linkify-it](https://github.com/markdown-it/linkify-it) instance.
       * Used by [linkify](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/linkify.js)
       * rule.
       **/
      this.linkify = new LinkifyIt();

      /**
       * MarkdownIt#validateLink(url) -> Boolean
       *
       * Link validation function. CommonMark allows too much in links. By default
       * we disable `javascript:`, `vbscript:`, `file:` schemas, and almost all `data:...` schemas
       * except some embedded image types.
       *
       * You can change this behaviour:
       *
       * ```javascript
       * var md = require('markdown-it')();
       * // enable everything
       * md.validateLink = function () { return true; }
       * ```
       **/
      this.validateLink = validateLink;

      /**
       * MarkdownIt#normalizeLink(url) -> String
       *
       * Function used to encode link url to a machine-readable format,
       * which includes url-encoding, punycode, etc.
       **/
      this.normalizeLink = normalizeLink;

      /**
       * MarkdownIt#normalizeLinkText(url) -> String
       *
       * Function used to decode link url to a human-readable format`
       **/
      this.normalizeLinkText = normalizeLinkText;


      // Expose utils & helpers for easy acces from plugins

      /**
       * MarkdownIt#utils -> utils
       *
       * Assorted utility functions, useful to write plugins. See details
       * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/common/utils.js).
       **/
      this.utils = utils;

      /**
       * MarkdownIt#helpers -> helpers
       *
       * Link components parser functions, useful to write plugins. See details
       * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/helpers).
       **/
      this.helpers = utils.assign({}, helpers);


      this.options = {};
      this.configure(presetName);

      if (options) { this.set(options); }
    }


    /** chainable
     * MarkdownIt.set(options)
     *
     * Set parser options (in the same format as in constructor). Probably, you
     * will never need it, but you can change options after constructor call.
     *
     * ##### Example
     *
     * ```javascript
     * var md = require('markdown-it')()
     *             .set({ html: true, breaks: true })
     *             .set({ typographer, true });
     * ```
     *
     * __Note:__ To achieve the best possible performance, don't modify a
     * `markdown-it` instance options on the fly. If you need multiple configurations
     * it's best to create multiple instances and initialize each with separate
     * config.
     **/
    MarkdownIt.prototype.set = function (options) {
      utils.assign(this.options, options);
      return this;
    };


    /** chainable, internal
     * MarkdownIt.configure(presets)
     *
     * Batch load of all options and compenent settings. This is internal method,
     * and you probably will not need it. But if you with - see available presets
     * and data structure [here](https://github.com/markdown-it/markdown-it/tree/master/lib/presets)
     *
     * We strongly recommend to use presets instead of direct config loads. That
     * will give better compatibility with next versions.
     **/
    MarkdownIt.prototype.configure = function (presets) {
      var self = this, presetName;

      if (utils.isString(presets)) {
        presetName = presets;
        presets = config[presetName];
        if (!presets) { throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name'); }
      }

      if (!presets) { throw new Error('Wrong `markdown-it` preset, can\'t be empty'); }

      if (presets.options) { self.set(presets.options); }

      if (presets.components) {
        Object.keys(presets.components).forEach(function (name) {
          if (presets.components[name].rules) {
            self[name].ruler.enableOnly(presets.components[name].rules);
          }
          if (presets.components[name].rules2) {
            self[name].ruler2.enableOnly(presets.components[name].rules2);
          }
        });
      }
      return this;
    };


    /** chainable
     * MarkdownIt.enable(list, ignoreInvalid)
     * - list (String|Array): rule name or list of rule names to enable
     * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
     *
     * Enable list or rules. It will automatically find appropriate components,
     * containing rules with given names. If rule not found, and `ignoreInvalid`
     * not set - throws exception.
     *
     * ##### Example
     *
     * ```javascript
     * var md = require('markdown-it')()
     *             .enable(['sub', 'sup'])
     *             .disable('smartquotes');
     * ```
     **/
    MarkdownIt.prototype.enable = function (list, ignoreInvalid) {
      var result = [];

      if (!Array.isArray(list)) { list = [ list ]; }

      [ 'core', 'block', 'inline' ].forEach(function (chain) {
        result = result.concat(this[chain].ruler.enable(list, true));
      }, this);

      result = result.concat(this.inline.ruler2.enable(list, true));

      var missed = list.filter(function (name) { return result.indexOf(name) < 0; });

      if (missed.length && !ignoreInvalid) {
        throw new Error('MarkdownIt. Failed to enable unknown rule(s): ' + missed);
      }

      return this;
    };


    /** chainable
     * MarkdownIt.disable(list, ignoreInvalid)
     * - list (String|Array): rule name or list of rule names to disable.
     * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
     *
     * The same as [[MarkdownIt.enable]], but turn specified rules off.
     **/
    MarkdownIt.prototype.disable = function (list, ignoreInvalid) {
      var result = [];

      if (!Array.isArray(list)) { list = [ list ]; }

      [ 'core', 'block', 'inline' ].forEach(function (chain) {
        result = result.concat(this[chain].ruler.disable(list, true));
      }, this);

      result = result.concat(this.inline.ruler2.disable(list, true));

      var missed = list.filter(function (name) { return result.indexOf(name) < 0; });

      if (missed.length && !ignoreInvalid) {
        throw new Error('MarkdownIt. Failed to disable unknown rule(s): ' + missed);
      }
      return this;
    };


    /** chainable
     * MarkdownIt.use(plugin, params)
     *
     * Load specified plugin with given params into current parser instance.
     * It's just a sugar to call `plugin(md, params)` with curring.
     *
     * ##### Example
     *
     * ```javascript
     * var iterator = require('markdown-it-for-inline');
     * var md = require('markdown-it')()
     *             .use(iterator, 'foo_replace', 'text', function (tokens, idx) {
     *               tokens[idx].content = tokens[idx].content.replace(/foo/g, 'bar');
     *             });
     * ```
     **/
    MarkdownIt.prototype.use = function (plugin /*, params, ... */) {
      var args = [ this ].concat(Array.prototype.slice.call(arguments, 1));
      plugin.apply(plugin, args);
      return this;
    };


    /** internal
     * MarkdownIt.parse(src, env) -> Array
     * - src (String): source string
     * - env (Object): environment sandbox
     *
     * Parse input string and returns list of block tokens (special token type
     * "inline" will contain list of inline tokens). You should not call this
     * method directly, until you write custom renderer (for example, to produce
     * AST).
     *
     * `env` is used to pass data between "distributed" rules and return additional
     * metadata like reference info, needed for the renderer. It also can be used to
     * inject data in specific cases. Usually, you will be ok to pass `{}`,
     * and then pass updated object to renderer.
     **/
    MarkdownIt.prototype.parse = function (src, env) {
      if (typeof src !== 'string') {
        throw new Error('Input data should be a String');
      }

      var state = new this.core.State(src, this, env);

      this.core.process(state);

      return state.tokens;
    };


    /**
     * MarkdownIt.render(src [, env]) -> String
     * - src (String): source string
     * - env (Object): environment sandbox
     *
     * Render markdown string into html. It does all magic for you :).
     *
     * `env` can be used to inject additional metadata (`{}` by default).
     * But you will not need it with high probability. See also comment
     * in [[MarkdownIt.parse]].
     **/
    MarkdownIt.prototype.render = function (src, env) {
      env = env || {};

      return this.renderer.render(this.parse(src, env), this.options, env);
    };


    /** internal
     * MarkdownIt.parseInline(src, env) -> Array
     * - src (String): source string
     * - env (Object): environment sandbox
     *
     * The same as [[MarkdownIt.parse]] but skip all block rules. It returns the
     * block tokens list with the single `inline` element, containing parsed inline
     * tokens in `children` property. Also updates `env` object.
     **/
    MarkdownIt.prototype.parseInline = function (src, env) {
      var state = new this.core.State(src, this, env);

      state.inlineMode = true;
      this.core.process(state);

      return state.tokens;
    };


    /**
     * MarkdownIt.renderInline(src [, env]) -> String
     * - src (String): source string
     * - env (Object): environment sandbox
     *
     * Similar to [[MarkdownIt.render]] but for single paragraph content. Result
     * will NOT be wrapped into `<p>` tags.
     **/
    MarkdownIt.prototype.renderInline = function (src, env) {
      env = env || {};

      return this.renderer.render(this.parseInline(src, env), this.options, env);
    };


    module.exports = MarkdownIt;

    },{"./common/utils":4,"./helpers":5,"./parser_block":10,"./parser_core":11,"./parser_inline":12,"./presets/commonmark":13,"./presets/default":14,"./presets/zero":15,"./renderer":16,"linkify-it":53,"mdurl":58,"punycode":60}],10:[function(require,module,exports){


    var Ruler           = require('./ruler');


    var _rules = [
      // First 2 params - rule name & source. Secondary array - list of rules,
      // which can be terminated by this one.
      [ 'table',      require('./rules_block/table'),      [ 'paragraph', 'reference' ] ],
      [ 'code',       require('./rules_block/code') ],
      [ 'fence',      require('./rules_block/fence'),      [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
      [ 'blockquote', require('./rules_block/blockquote'), [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
      [ 'hr',         require('./rules_block/hr'),         [ 'paragraph', 'reference', 'blockquote', 'list' ] ],
      [ 'list',       require('./rules_block/list'),       [ 'paragraph', 'reference', 'blockquote' ] ],
      [ 'reference',  require('./rules_block/reference') ],
      [ 'heading',    require('./rules_block/heading'),    [ 'paragraph', 'reference', 'blockquote' ] ],
      [ 'lheading',   require('./rules_block/lheading') ],
      [ 'html_block', require('./rules_block/html_block'), [ 'paragraph', 'reference', 'blockquote' ] ],
      [ 'paragraph',  require('./rules_block/paragraph') ]
    ];


    /**
     * new ParserBlock()
     **/
    function ParserBlock() {
      /**
       * ParserBlock#ruler -> Ruler
       *
       * [[Ruler]] instance. Keep configuration of block rules.
       **/
      this.ruler = new Ruler();

      for (var i = 0; i < _rules.length; i++) {
        this.ruler.push(_rules[i][0], _rules[i][1], { alt: (_rules[i][2] || []).slice() });
      }
    }


    // Generate tokens for input range
    //
    ParserBlock.prototype.tokenize = function (state, startLine, endLine) {
      var ok, i,
          rules = this.ruler.getRules(''),
          len = rules.length,
          line = startLine,
          hasEmptyLines = false,
          maxNesting = state.md.options.maxNesting;

      while (line < endLine) {
        state.line = line = state.skipEmptyLines(line);
        if (line >= endLine) { break; }

        // Termination condition for nested calls.
        // Nested calls currently used for blockquotes & lists
        if (state.sCount[line] < state.blkIndent) { break; }

        // If nesting level exceeded - skip tail to the end. That's not ordinary
        // situation and we should not care about content.
        if (state.level >= maxNesting) {
          state.line = endLine;
          break;
        }

        // Try all possible rules.
        // On success, rule should:
        //
        // - update `state.line`
        // - update `state.tokens`
        // - return true

        for (i = 0; i < len; i++) {
          ok = rules[i](state, line, endLine, false);
          if (ok) { break; }
        }

        // set state.tight if we had an empty line before current tag
        // i.e. latest empty line should not count
        state.tight = !hasEmptyLines;

        // paragraph might "eat" one newline after it in nested lists
        if (state.isEmpty(state.line - 1)) {
          hasEmptyLines = true;
        }

        line = state.line;

        if (line < endLine && state.isEmpty(line)) {
          hasEmptyLines = true;
          line++;
          state.line = line;
        }
      }
    };


    /**
     * ParserBlock.parse(str, md, env, outTokens)
     *
     * Process input string and push block tokens into `outTokens`
     **/
    ParserBlock.prototype.parse = function (src, md, env, outTokens) {
      var state;

      if (!src) { return; }

      state = new this.State(src, md, env, outTokens);

      this.tokenize(state, state.line, state.lineMax);
    };


    ParserBlock.prototype.State = require('./rules_block/state_block');


    module.exports = ParserBlock;

    },{"./ruler":17,"./rules_block/blockquote":18,"./rules_block/code":19,"./rules_block/fence":20,"./rules_block/heading":21,"./rules_block/hr":22,"./rules_block/html_block":23,"./rules_block/lheading":24,"./rules_block/list":25,"./rules_block/paragraph":26,"./rules_block/reference":27,"./rules_block/state_block":28,"./rules_block/table":29}],11:[function(require,module,exports){


    var Ruler  = require('./ruler');


    var _rules = [
      [ 'normalize',      require('./rules_core/normalize')      ],
      [ 'block',          require('./rules_core/block')          ],
      [ 'inline',         require('./rules_core/inline')         ],
      [ 'linkify',        require('./rules_core/linkify')        ],
      [ 'replacements',   require('./rules_core/replacements')   ],
      [ 'smartquotes',    require('./rules_core/smartquotes')    ]
    ];


    /**
     * new Core()
     **/
    function Core() {
      /**
       * Core#ruler -> Ruler
       *
       * [[Ruler]] instance. Keep configuration of core rules.
       **/
      this.ruler = new Ruler();

      for (var i = 0; i < _rules.length; i++) {
        this.ruler.push(_rules[i][0], _rules[i][1]);
      }
    }


    /**
     * Core.process(state)
     *
     * Executes core chain rules.
     **/
    Core.prototype.process = function (state) {
      var i, l, rules;

      rules = this.ruler.getRules('');

      for (i = 0, l = rules.length; i < l; i++) {
        rules[i](state);
      }
    };

    Core.prototype.State = require('./rules_core/state_core');


    module.exports = Core;

    },{"./ruler":17,"./rules_core/block":30,"./rules_core/inline":31,"./rules_core/linkify":32,"./rules_core/normalize":33,"./rules_core/replacements":34,"./rules_core/smartquotes":35,"./rules_core/state_core":36}],12:[function(require,module,exports){


    var Ruler           = require('./ruler');


    ////////////////////////////////////////////////////////////////////////////////
    // Parser rules

    var _rules = [
      [ 'text',            require('./rules_inline/text') ],
      [ 'newline',         require('./rules_inline/newline') ],
      [ 'escape',          require('./rules_inline/escape') ],
      [ 'backticks',       require('./rules_inline/backticks') ],
      [ 'strikethrough',   require('./rules_inline/strikethrough').tokenize ],
      [ 'emphasis',        require('./rules_inline/emphasis').tokenize ],
      [ 'link',            require('./rules_inline/link') ],
      [ 'image',           require('./rules_inline/image') ],
      [ 'autolink',        require('./rules_inline/autolink') ],
      [ 'html_inline',     require('./rules_inline/html_inline') ],
      [ 'entity',          require('./rules_inline/entity') ]
    ];

    var _rules2 = [
      [ 'balance_pairs',   require('./rules_inline/balance_pairs') ],
      [ 'strikethrough',   require('./rules_inline/strikethrough').postProcess ],
      [ 'emphasis',        require('./rules_inline/emphasis').postProcess ],
      [ 'text_collapse',   require('./rules_inline/text_collapse') ]
    ];


    /**
     * new ParserInline()
     **/
    function ParserInline() {
      var i;

      /**
       * ParserInline#ruler -> Ruler
       *
       * [[Ruler]] instance. Keep configuration of inline rules.
       **/
      this.ruler = new Ruler();

      for (i = 0; i < _rules.length; i++) {
        this.ruler.push(_rules[i][0], _rules[i][1]);
      }

      /**
       * ParserInline#ruler2 -> Ruler
       *
       * [[Ruler]] instance. Second ruler used for post-processing
       * (e.g. in emphasis-like rules).
       **/
      this.ruler2 = new Ruler();

      for (i = 0; i < _rules2.length; i++) {
        this.ruler2.push(_rules2[i][0], _rules2[i][1]);
      }
    }


    // Skip single token by running all rules in validation mode;
    // returns `true` if any rule reported success
    //
    ParserInline.prototype.skipToken = function (state) {
      var ok, i, pos = state.pos,
          rules = this.ruler.getRules(''),
          len = rules.length,
          maxNesting = state.md.options.maxNesting,
          cache = state.cache;


      if (typeof cache[pos] !== 'undefined') {
        state.pos = cache[pos];
        return;
      }

      if (state.level < maxNesting) {
        for (i = 0; i < len; i++) {
          // Increment state.level and decrement it later to limit recursion.
          // It's harmless to do here, because no tokens are created. But ideally,
          // we'd need a separate private state variable for this purpose.
          //
          state.level++;
          ok = rules[i](state, true);
          state.level--;

          if (ok) { break; }
        }
      } else {
        // Too much nesting, just skip until the end of the paragraph.
        //
        // NOTE: this will cause links to behave incorrectly in the following case,
        //       when an amount of `[` is exactly equal to `maxNesting + 1`:
        //
        //       [[[[[[[[[[[[[[[[[[[[[foo]()
        //
        // TODO: remove this workaround when CM standard will allow nested links
        //       (we can replace it by preventing links from being parsed in
        //       validation mode)
        //
        state.pos = state.posMax;
      }

      if (!ok) { state.pos++; }
      cache[pos] = state.pos;
    };


    // Generate tokens for input range
    //
    ParserInline.prototype.tokenize = function (state) {
      var ok, i,
          rules = this.ruler.getRules(''),
          len = rules.length,
          end = state.posMax,
          maxNesting = state.md.options.maxNesting;

      while (state.pos < end) {
        // Try all possible rules.
        // On success, rule should:
        //
        // - update `state.pos`
        // - update `state.tokens`
        // - return true

        if (state.level < maxNesting) {
          for (i = 0; i < len; i++) {
            ok = rules[i](state, false);
            if (ok) { break; }
          }
        }

        if (ok) {
          if (state.pos >= end) { break; }
          continue;
        }

        state.pending += state.src[state.pos++];
      }

      if (state.pending) {
        state.pushPending();
      }
    };


    /**
     * ParserInline.parse(str, md, env, outTokens)
     *
     * Process input string and push inline tokens into `outTokens`
     **/
    ParserInline.prototype.parse = function (str, md, env, outTokens) {
      var i, rules, len;
      var state = new this.State(str, md, env, outTokens);

      this.tokenize(state);

      rules = this.ruler2.getRules('');
      len = rules.length;

      for (i = 0; i < len; i++) {
        rules[i](state);
      }
    };


    ParserInline.prototype.State = require('./rules_inline/state_inline');


    module.exports = ParserInline;

    },{"./ruler":17,"./rules_inline/autolink":37,"./rules_inline/backticks":38,"./rules_inline/balance_pairs":39,"./rules_inline/emphasis":40,"./rules_inline/entity":41,"./rules_inline/escape":42,"./rules_inline/html_inline":43,"./rules_inline/image":44,"./rules_inline/link":45,"./rules_inline/newline":46,"./rules_inline/state_inline":47,"./rules_inline/strikethrough":48,"./rules_inline/text":49,"./rules_inline/text_collapse":50}],13:[function(require,module,exports){


    module.exports = {
      options: {
        html:         true,         // Enable HTML tags in source
        xhtmlOut:     true,         // Use '/' to close single tags (<br />)
        breaks:       false,        // Convert '\n' in paragraphs into <br>
        langPrefix:   'language-',  // CSS language prefix for fenced blocks
        linkify:      false,        // autoconvert URL-like texts to links

        // Enable some language-neutral replacements + quotes beautification
        typographer:  false,

        // Double + single quotes replacement pairs, when typographer enabled,
        // and smartquotes on. Could be either a String or an Array.
        //
        // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
        // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
        quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

        // Highlighter function. Should return escaped HTML,
        // or '' if the source string is not changed and should be escaped externaly.
        // If result starts with <pre... internal wrapper is skipped.
        //
        // function (/*str, lang*/) { return ''; }
        //
        highlight: null,

        maxNesting:   20            // Internal protection, recursion limit
      },

      components: {

        core: {
          rules: [
            'normalize',
            'block',
            'inline'
          ]
        },

        block: {
          rules: [
            'blockquote',
            'code',
            'fence',
            'heading',
            'hr',
            'html_block',
            'lheading',
            'list',
            'reference',
            'paragraph'
          ]
        },

        inline: {
          rules: [
            'autolink',
            'backticks',
            'emphasis',
            'entity',
            'escape',
            'html_inline',
            'image',
            'link',
            'newline',
            'text'
          ],
          rules2: [
            'balance_pairs',
            'emphasis',
            'text_collapse'
          ]
        }
      }
    };

    },{}],14:[function(require,module,exports){


    module.exports = {
      options: {
        html:         false,        // Enable HTML tags in source
        xhtmlOut:     false,        // Use '/' to close single tags (<br />)
        breaks:       false,        // Convert '\n' in paragraphs into <br>
        langPrefix:   'language-',  // CSS language prefix for fenced blocks
        linkify:      false,        // autoconvert URL-like texts to links

        // Enable some language-neutral replacements + quotes beautification
        typographer:  false,

        // Double + single quotes replacement pairs, when typographer enabled,
        // and smartquotes on. Could be either a String or an Array.
        //
        // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
        // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
        quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

        // Highlighter function. Should return escaped HTML,
        // or '' if the source string is not changed and should be escaped externaly.
        // If result starts with <pre... internal wrapper is skipped.
        //
        // function (/*str, lang*/) { return ''; }
        //
        highlight: null,

        maxNesting:   100            // Internal protection, recursion limit
      },

      components: {

        core: {},
        block: {},
        inline: {}
      }
    };

    },{}],15:[function(require,module,exports){


    module.exports = {
      options: {
        html:         false,        // Enable HTML tags in source
        xhtmlOut:     false,        // Use '/' to close single tags (<br />)
        breaks:       false,        // Convert '\n' in paragraphs into <br>
        langPrefix:   'language-',  // CSS language prefix for fenced blocks
        linkify:      false,        // autoconvert URL-like texts to links

        // Enable some language-neutral replacements + quotes beautification
        typographer:  false,

        // Double + single quotes replacement pairs, when typographer enabled,
        // and smartquotes on. Could be either a String or an Array.
        //
        // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
        // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
        quotes: '\u201c\u201d\u2018\u2019', /* “”‘’ */

        // Highlighter function. Should return escaped HTML,
        // or '' if the source string is not changed and should be escaped externaly.
        // If result starts with <pre... internal wrapper is skipped.
        //
        // function (/*str, lang*/) { return ''; }
        //
        highlight: null,

        maxNesting:   20            // Internal protection, recursion limit
      },

      components: {

        core: {
          rules: [
            'normalize',
            'block',
            'inline'
          ]
        },

        block: {
          rules: [
            'paragraph'
          ]
        },

        inline: {
          rules: [
            'text'
          ],
          rules2: [
            'balance_pairs',
            'text_collapse'
          ]
        }
      }
    };

    },{}],16:[function(require,module,exports){


    var assign          = require('./common/utils').assign;
    var unescapeAll     = require('./common/utils').unescapeAll;
    var escapeHtml      = require('./common/utils').escapeHtml;


    ////////////////////////////////////////////////////////////////////////////////

    var default_rules = {};


    default_rules.code_inline = function (tokens, idx, options, env, slf) {
      var token = tokens[idx];

      return  '<code' + slf.renderAttrs(token) + '>' +
              escapeHtml(tokens[idx].content) +
              '</code>';
    };


    default_rules.code_block = function (tokens, idx, options, env, slf) {
      var token = tokens[idx];

      return  '<pre' + slf.renderAttrs(token) + '><code>' +
              escapeHtml(tokens[idx].content) +
              '</code></pre>\n';
    };


    default_rules.fence = function (tokens, idx, options, env, slf) {
      var token = tokens[idx],
          info = token.info ? unescapeAll(token.info).trim() : '',
          langName = '',
          highlighted, i, tmpAttrs, tmpToken;

      if (info) {
        langName = info.split(/\s+/g)[0];
      }

      if (options.highlight) {
        highlighted = options.highlight(token.content, langName) || escapeHtml(token.content);
      } else {
        highlighted = escapeHtml(token.content);
      }

      if (highlighted.indexOf('<pre') === 0) {
        return highlighted + '\n';
      }

      // If language exists, inject class gently, without modifying original token.
      // May be, one day we will add .clone() for token and simplify this part, but
      // now we prefer to keep things local.
      if (info) {
        i        = token.attrIndex('class');
        tmpAttrs = token.attrs ? token.attrs.slice() : [];

        if (i < 0) {
          tmpAttrs.push([ 'class', options.langPrefix + langName ]);
        } else {
          tmpAttrs[i][1] += ' ' + options.langPrefix + langName;
        }

        // Fake token just to render attributes
        tmpToken = {
          attrs: tmpAttrs
        };

        return  '<pre><code' + slf.renderAttrs(tmpToken) + '>'
              + highlighted
              + '</code></pre>\n';
      }


      return  '<pre><code' + slf.renderAttrs(token) + '>'
            + highlighted
            + '</code></pre>\n';
    };


    default_rules.image = function (tokens, idx, options, env, slf) {
      var token = tokens[idx];

      // "alt" attr MUST be set, even if empty. Because it's mandatory and
      // should be placed on proper position for tests.
      //
      // Replace content with actual value

      token.attrs[token.attrIndex('alt')][1] =
        slf.renderInlineAsText(token.children, options, env);

      return slf.renderToken(tokens, idx, options);
    };


    default_rules.hardbreak = function (tokens, idx, options /*, env */) {
      return options.xhtmlOut ? '<br />\n' : '<br>\n';
    };
    default_rules.softbreak = function (tokens, idx, options /*, env */) {
      return options.breaks ? (options.xhtmlOut ? '<br />\n' : '<br>\n') : '\n';
    };


    default_rules.text = function (tokens, idx /*, options, env */) {
      return escapeHtml(tokens[idx].content);
    };


    default_rules.html_block = function (tokens, idx /*, options, env */) {
      return tokens[idx].content;
    };
    default_rules.html_inline = function (tokens, idx /*, options, env */) {
      return tokens[idx].content;
    };


    /**
     * new Renderer()
     *
     * Creates new [[Renderer]] instance and fill [[Renderer#rules]] with defaults.
     **/
    function Renderer() {

      /**
       * Renderer#rules -> Object
       *
       * Contains render rules for tokens. Can be updated and extended.
       *
       * ##### Example
       *
       * ```javascript
       * var md = require('markdown-it')();
       *
       * md.renderer.rules.strong_open  = function () { return '<b>'; };
       * md.renderer.rules.strong_close = function () { return '</b>'; };
       *
       * var result = md.renderInline(...);
       * ```
       *
       * Each rule is called as independent static function with fixed signature:
       *
       * ```javascript
       * function my_token_render(tokens, idx, options, env, renderer) {
       *   // ...
       *   return renderedHTML;
       * }
       * ```
       *
       * See [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.js)
       * for more details and examples.
       **/
      this.rules = assign({}, default_rules);
    }


    /**
     * Renderer.renderAttrs(token) -> String
     *
     * Render token attributes to string.
     **/
    Renderer.prototype.renderAttrs = function renderAttrs(token) {
      var i, l, result;

      if (!token.attrs) { return ''; }

      result = '';

      for (i = 0, l = token.attrs.length; i < l; i++) {
        result += ' ' + escapeHtml(token.attrs[i][0]) + '="' + escapeHtml(token.attrs[i][1]) + '"';
      }

      return result;
    };


    /**
     * Renderer.renderToken(tokens, idx, options) -> String
     * - tokens (Array): list of tokens
     * - idx (Numbed): token index to render
     * - options (Object): params of parser instance
     *
     * Default token renderer. Can be overriden by custom function
     * in [[Renderer#rules]].
     **/
    Renderer.prototype.renderToken = function renderToken(tokens, idx, options) {
      var nextToken,
          result = '',
          needLf = false,
          token = tokens[idx];

      // Tight list paragraphs
      if (token.hidden) {
        return '';
      }

      // Insert a newline between hidden paragraph and subsequent opening
      // block-level tag.
      //
      // For example, here we should insert a newline before blockquote:
      //  - a
      //    >
      //
      if (token.block && token.nesting !== -1 && idx && tokens[idx - 1].hidden) {
        result += '\n';
      }

      // Add token name, e.g. `<img`
      result += (token.nesting === -1 ? '</' : '<') + token.tag;

      // Encode attributes, e.g. `<img src="foo"`
      result += this.renderAttrs(token);

      // Add a slash for self-closing tags, e.g. `<img src="foo" /`
      if (token.nesting === 0 && options.xhtmlOut) {
        result += ' /';
      }

      // Check if we need to add a newline after this tag
      if (token.block) {
        needLf = true;

        if (token.nesting === 1) {
          if (idx + 1 < tokens.length) {
            nextToken = tokens[idx + 1];

            if (nextToken.type === 'inline' || nextToken.hidden) {
              // Block-level tag containing an inline tag.
              //
              needLf = false;

            } else if (nextToken.nesting === -1 && nextToken.tag === token.tag) {
              // Opening tag + closing tag of the same type. E.g. `<li></li>`.
              //
              needLf = false;
            }
          }
        }
      }

      result += needLf ? '>\n' : '>';

      return result;
    };


    /**
     * Renderer.renderInline(tokens, options, env) -> String
     * - tokens (Array): list on block tokens to renter
     * - options (Object): params of parser instance
     * - env (Object): additional data from parsed input (references, for example)
     *
     * The same as [[Renderer.render]], but for single token of `inline` type.
     **/
    Renderer.prototype.renderInline = function (tokens, options, env) {
      var type,
          result = '',
          rules = this.rules;

      for (var i = 0, len = tokens.length; i < len; i++) {
        type = tokens[i].type;

        if (typeof rules[type] !== 'undefined') {
          result += rules[type](tokens, i, options, env, this);
        } else {
          result += this.renderToken(tokens, i, options);
        }
      }

      return result;
    };


    /** internal
     * Renderer.renderInlineAsText(tokens, options, env) -> String
     * - tokens (Array): list on block tokens to renter
     * - options (Object): params of parser instance
     * - env (Object): additional data from parsed input (references, for example)
     *
     * Special kludge for image `alt` attributes to conform CommonMark spec.
     * Don't try to use it! Spec requires to show `alt` content with stripped markup,
     * instead of simple escaping.
     **/
    Renderer.prototype.renderInlineAsText = function (tokens, options, env) {
      var result = '';

      for (var i = 0, len = tokens.length; i < len; i++) {
        if (tokens[i].type === 'text') {
          result += tokens[i].content;
        } else if (tokens[i].type === 'image') {
          result += this.renderInlineAsText(tokens[i].children, options, env);
        }
      }

      return result;
    };


    /**
     * Renderer.render(tokens, options, env) -> String
     * - tokens (Array): list on block tokens to renter
     * - options (Object): params of parser instance
     * - env (Object): additional data from parsed input (references, for example)
     *
     * Takes token stream and generates HTML. Probably, you will never need to call
     * this method directly.
     **/
    Renderer.prototype.render = function (tokens, options, env) {
      var i, len, type,
          result = '',
          rules = this.rules;

      for (i = 0, len = tokens.length; i < len; i++) {
        type = tokens[i].type;

        if (type === 'inline') {
          result += this.renderInline(tokens[i].children, options, env);
        } else if (typeof rules[type] !== 'undefined') {
          result += rules[tokens[i].type](tokens, i, options, env, this);
        } else {
          result += this.renderToken(tokens, i, options, env);
        }
      }

      return result;
    };

    module.exports = Renderer;

    },{"./common/utils":4}],17:[function(require,module,exports){


    /**
     * new Ruler()
     **/
    function Ruler() {
      // List of added rules. Each element is:
      //
      // {
      //   name: XXX,
      //   enabled: Boolean,
      //   fn: Function(),
      //   alt: [ name2, name3 ]
      // }
      //
      this.__rules__ = [];

      // Cached rule chains.
      //
      // First level - chain name, '' for default.
      // Second level - diginal anchor for fast filtering by charcodes.
      //
      this.__cache__ = null;
    }

    ////////////////////////////////////////////////////////////////////////////////
    // Helper methods, should not be used directly


    // Find rule index by name
    //
    Ruler.prototype.__find__ = function (name) {
      for (var i = 0; i < this.__rules__.length; i++) {
        if (this.__rules__[i].name === name) {
          return i;
        }
      }
      return -1;
    };


    // Build rules lookup cache
    //
    Ruler.prototype.__compile__ = function () {
      var self = this;
      var chains = [ '' ];

      // collect unique names
      self.__rules__.forEach(function (rule) {
        if (!rule.enabled) { return; }

        rule.alt.forEach(function (altName) {
          if (chains.indexOf(altName) < 0) {
            chains.push(altName);
          }
        });
      });

      self.__cache__ = {};

      chains.forEach(function (chain) {
        self.__cache__[chain] = [];
        self.__rules__.forEach(function (rule) {
          if (!rule.enabled) { return; }

          if (chain && rule.alt.indexOf(chain) < 0) { return; }

          self.__cache__[chain].push(rule.fn);
        });
      });
    };


    /**
     * Ruler.at(name, fn [, options])
     * - name (String): rule name to replace.
     * - fn (Function): new rule function.
     * - options (Object): new rule options (not mandatory).
     *
     * Replace rule by name with new function & options. Throws error if name not
     * found.
     *
     * ##### Options:
     *
     * - __alt__ - array with names of "alternate" chains.
     *
     * ##### Example
     *
     * Replace existing typographer replacement rule with new one:
     *
     * ```javascript
     * var md = require('markdown-it')();
     *
     * md.core.ruler.at('replacements', function replace(state) {
     *   //...
     * });
     * ```
     **/
    Ruler.prototype.at = function (name, fn, options) {
      var index = this.__find__(name);
      var opt = options || {};

      if (index === -1) { throw new Error('Parser rule not found: ' + name); }

      this.__rules__[index].fn = fn;
      this.__rules__[index].alt = opt.alt || [];
      this.__cache__ = null;
    };


    /**
     * Ruler.before(beforeName, ruleName, fn [, options])
     * - beforeName (String): new rule will be added before this one.
     * - ruleName (String): name of added rule.
     * - fn (Function): rule function.
     * - options (Object): rule options (not mandatory).
     *
     * Add new rule to chain before one with given name. See also
     * [[Ruler.after]], [[Ruler.push]].
     *
     * ##### Options:
     *
     * - __alt__ - array with names of "alternate" chains.
     *
     * ##### Example
     *
     * ```javascript
     * var md = require('markdown-it')();
     *
     * md.block.ruler.before('paragraph', 'my_rule', function replace(state) {
     *   //...
     * });
     * ```
     **/
    Ruler.prototype.before = function (beforeName, ruleName, fn, options) {
      var index = this.__find__(beforeName);
      var opt = options || {};

      if (index === -1) { throw new Error('Parser rule not found: ' + beforeName); }

      this.__rules__.splice(index, 0, {
        name: ruleName,
        enabled: true,
        fn: fn,
        alt: opt.alt || []
      });

      this.__cache__ = null;
    };


    /**
     * Ruler.after(afterName, ruleName, fn [, options])
     * - afterName (String): new rule will be added after this one.
     * - ruleName (String): name of added rule.
     * - fn (Function): rule function.
     * - options (Object): rule options (not mandatory).
     *
     * Add new rule to chain after one with given name. See also
     * [[Ruler.before]], [[Ruler.push]].
     *
     * ##### Options:
     *
     * - __alt__ - array with names of "alternate" chains.
     *
     * ##### Example
     *
     * ```javascript
     * var md = require('markdown-it')();
     *
     * md.inline.ruler.after('text', 'my_rule', function replace(state) {
     *   //...
     * });
     * ```
     **/
    Ruler.prototype.after = function (afterName, ruleName, fn, options) {
      var index = this.__find__(afterName);
      var opt = options || {};

      if (index === -1) { throw new Error('Parser rule not found: ' + afterName); }

      this.__rules__.splice(index + 1, 0, {
        name: ruleName,
        enabled: true,
        fn: fn,
        alt: opt.alt || []
      });

      this.__cache__ = null;
    };

    /**
     * Ruler.push(ruleName, fn [, options])
     * - ruleName (String): name of added rule.
     * - fn (Function): rule function.
     * - options (Object): rule options (not mandatory).
     *
     * Push new rule to the end of chain. See also
     * [[Ruler.before]], [[Ruler.after]].
     *
     * ##### Options:
     *
     * - __alt__ - array with names of "alternate" chains.
     *
     * ##### Example
     *
     * ```javascript
     * var md = require('markdown-it')();
     *
     * md.core.ruler.push('my_rule', function replace(state) {
     *   //...
     * });
     * ```
     **/
    Ruler.prototype.push = function (ruleName, fn, options) {
      var opt = options || {};

      this.__rules__.push({
        name: ruleName,
        enabled: true,
        fn: fn,
        alt: opt.alt || []
      });

      this.__cache__ = null;
    };


    /**
     * Ruler.enable(list [, ignoreInvalid]) -> Array
     * - list (String|Array): list of rule names to enable.
     * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
     *
     * Enable rules with given names. If any rule name not found - throw Error.
     * Errors can be disabled by second param.
     *
     * Returns list of found rule names (if no exception happened).
     *
     * See also [[Ruler.disable]], [[Ruler.enableOnly]].
     **/
    Ruler.prototype.enable = function (list, ignoreInvalid) {
      if (!Array.isArray(list)) { list = [ list ]; }

      var result = [];

      // Search by name and enable
      list.forEach(function (name) {
        var idx = this.__find__(name);

        if (idx < 0) {
          if (ignoreInvalid) { return; }
          throw new Error('Rules manager: invalid rule name ' + name);
        }
        this.__rules__[idx].enabled = true;
        result.push(name);
      }, this);

      this.__cache__ = null;
      return result;
    };


    /**
     * Ruler.enableOnly(list [, ignoreInvalid])
     * - list (String|Array): list of rule names to enable (whitelist).
     * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
     *
     * Enable rules with given names, and disable everything else. If any rule name
     * not found - throw Error. Errors can be disabled by second param.
     *
     * See also [[Ruler.disable]], [[Ruler.enable]].
     **/
    Ruler.prototype.enableOnly = function (list, ignoreInvalid) {
      if (!Array.isArray(list)) { list = [ list ]; }

      this.__rules__.forEach(function (rule) { rule.enabled = false; });

      this.enable(list, ignoreInvalid);
    };


    /**
     * Ruler.disable(list [, ignoreInvalid]) -> Array
     * - list (String|Array): list of rule names to disable.
     * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
     *
     * Disable rules with given names. If any rule name not found - throw Error.
     * Errors can be disabled by second param.
     *
     * Returns list of found rule names (if no exception happened).
     *
     * See also [[Ruler.enable]], [[Ruler.enableOnly]].
     **/
    Ruler.prototype.disable = function (list, ignoreInvalid) {
      if (!Array.isArray(list)) { list = [ list ]; }

      var result = [];

      // Search by name and disable
      list.forEach(function (name) {
        var idx = this.__find__(name);

        if (idx < 0) {
          if (ignoreInvalid) { return; }
          throw new Error('Rules manager: invalid rule name ' + name);
        }
        this.__rules__[idx].enabled = false;
        result.push(name);
      }, this);

      this.__cache__ = null;
      return result;
    };


    /**
     * Ruler.getRules(chainName) -> Array
     *
     * Return array of active functions (rules) for given chain name. It analyzes
     * rules configuration, compiles caches if not exists and returns result.
     *
     * Default chain name is `''` (empty string). It can't be skipped. That's
     * done intentionally, to keep signature monomorphic for high speed.
     **/
    Ruler.prototype.getRules = function (chainName) {
      if (this.__cache__ === null) {
        this.__compile__();
      }

      // Chain can be empty, if rules disabled. But we still have to return Array.
      return this.__cache__[chainName] || [];
    };

    module.exports = Ruler;

    },{}],18:[function(require,module,exports){

    var isSpace = require('../common/utils').isSpace;


    module.exports = function blockquote(state, startLine, endLine, silent) {
      var adjustTab,
          ch,
          i,
          initial,
          l,
          lastLineEmpty,
          lines,
          nextLine,
          offset,
          oldBMarks,
          oldBSCount,
          oldIndent,
          oldParentType,
          oldSCount,
          oldTShift,
          spaceAfterMarker,
          terminate,
          terminatorRules,
          token,
          wasOutdented,
          oldLineMax = state.lineMax,
          pos = state.bMarks[startLine] + state.tShift[startLine],
          max = state.eMarks[startLine];

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      // check the block quote marker
      if (state.src.charCodeAt(pos++) !== 0x3E/* > */) { return false; }

      // we know that it's going to be a valid blockquote,
      // so no point trying to find the end of it in silent mode
      if (silent) { return true; }

      // skip spaces after ">" and re-calculate offset
      initial = offset = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);

      // skip one optional space after '>'
      if (state.src.charCodeAt(pos) === 0x20 /* space */) {
        // ' >   test '
        //     ^ -- position start of line here:
        pos++;
        initial++;
        offset++;
        adjustTab = false;
        spaceAfterMarker = true;
      } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
        spaceAfterMarker = true;

        if ((state.bsCount[startLine] + offset) % 4 === 3) {
          // '  >\t  test '
          //       ^ -- position start of line here (tab has width===1)
          pos++;
          initial++;
          offset++;
          adjustTab = false;
        } else {
          // ' >\t  test '
          //    ^ -- position start of line here + shift bsCount slightly
          //         to make extra space appear
          adjustTab = true;
        }
      } else {
        spaceAfterMarker = false;
      }

      oldBMarks = [ state.bMarks[startLine] ];
      state.bMarks[startLine] = pos;

      while (pos < max) {
        ch = state.src.charCodeAt(pos);

        if (isSpace(ch)) {
          if (ch === 0x09) {
            offset += 4 - (offset + state.bsCount[startLine] + (adjustTab ? 1 : 0)) % 4;
          } else {
            offset++;
          }
        } else {
          break;
        }

        pos++;
      }

      oldBSCount = [ state.bsCount[startLine] ];
      state.bsCount[startLine] = state.sCount[startLine] + 1 + (spaceAfterMarker ? 1 : 0);

      lastLineEmpty = pos >= max;

      oldSCount = [ state.sCount[startLine] ];
      state.sCount[startLine] = offset - initial;

      oldTShift = [ state.tShift[startLine] ];
      state.tShift[startLine] = pos - state.bMarks[startLine];

      terminatorRules = state.md.block.ruler.getRules('blockquote');

      oldParentType = state.parentType;
      state.parentType = 'blockquote';
      wasOutdented = false;

      // Search the end of the block
      //
      // Block ends with either:
      //  1. an empty line outside:
      //     ```
      //     > test
      //
      //     ```
      //  2. an empty line inside:
      //     ```
      //     >
      //     test
      //     ```
      //  3. another tag:
      //     ```
      //     > test
      //      - - -
      //     ```
      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        // check if it's outdented, i.e. it's inside list item and indented
        // less than said list item:
        //
        // ```
        // 1. anything
        //    > current blockquote
        // 2. checking this line
        // ```
        if (state.sCount[nextLine] < state.blkIndent) wasOutdented = true;

        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];

        if (pos >= max) {
          // Case 1: line is not inside the blockquote, and this line is empty.
          break;
        }

        if (state.src.charCodeAt(pos++) === 0x3E/* > */ && !wasOutdented) {
          // This line is inside the blockquote.

          // skip spaces after ">" and re-calculate offset
          initial = offset = state.sCount[nextLine] + pos - (state.bMarks[nextLine] + state.tShift[nextLine]);

          // skip one optional space after '>'
          if (state.src.charCodeAt(pos) === 0x20 /* space */) {
            // ' >   test '
            //     ^ -- position start of line here:
            pos++;
            initial++;
            offset++;
            adjustTab = false;
            spaceAfterMarker = true;
          } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
            spaceAfterMarker = true;

            if ((state.bsCount[nextLine] + offset) % 4 === 3) {
              // '  >\t  test '
              //       ^ -- position start of line here (tab has width===1)
              pos++;
              initial++;
              offset++;
              adjustTab = false;
            } else {
              // ' >\t  test '
              //    ^ -- position start of line here + shift bsCount slightly
              //         to make extra space appear
              adjustTab = true;
            }
          } else {
            spaceAfterMarker = false;
          }

          oldBMarks.push(state.bMarks[nextLine]);
          state.bMarks[nextLine] = pos;

          while (pos < max) {
            ch = state.src.charCodeAt(pos);

            if (isSpace(ch)) {
              if (ch === 0x09) {
                offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
              } else {
                offset++;
              }
            } else {
              break;
            }

            pos++;
          }

          lastLineEmpty = pos >= max;

          oldBSCount.push(state.bsCount[nextLine]);
          state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);

          oldSCount.push(state.sCount[nextLine]);
          state.sCount[nextLine] = offset - initial;

          oldTShift.push(state.tShift[nextLine]);
          state.tShift[nextLine] = pos - state.bMarks[nextLine];
          continue;
        }

        // Case 2: line is not inside the blockquote, and the last line was empty.
        if (lastLineEmpty) { break; }

        // Case 3: another tag found.
        terminate = false;
        for (i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }

        if (terminate) {
          // Quirk to enforce "hard termination mode" for paragraphs;
          // normally if you call `tokenize(state, startLine, nextLine)`,
          // paragraphs will look below nextLine for paragraph continuation,
          // but if blockquote is terminated by another tag, they shouldn't
          state.lineMax = nextLine;

          if (state.blkIndent !== 0) {
            // state.blkIndent was non-zero, we now set it to zero,
            // so we need to re-calculate all offsets to appear as
            // if indent wasn't changed
            oldBMarks.push(state.bMarks[nextLine]);
            oldBSCount.push(state.bsCount[nextLine]);
            oldTShift.push(state.tShift[nextLine]);
            oldSCount.push(state.sCount[nextLine]);
            state.sCount[nextLine] -= state.blkIndent;
          }

          break;
        }

        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);

        // A negative indentation means that this is a paragraph continuation
        //
        state.sCount[nextLine] = -1;
      }

      oldIndent = state.blkIndent;
      state.blkIndent = 0;

      token        = state.push('blockquote_open', 'blockquote', 1);
      token.markup = '>';
      token.map    = lines = [ startLine, 0 ];

      state.md.block.tokenize(state, startLine, nextLine);

      token        = state.push('blockquote_close', 'blockquote', -1);
      token.markup = '>';

      state.lineMax = oldLineMax;
      state.parentType = oldParentType;
      lines[1] = state.line;

      // Restore original tShift; this might not be necessary since the parser
      // has already been here, but just to make sure we can do that.
      for (i = 0; i < oldTShift.length; i++) {
        state.bMarks[i + startLine] = oldBMarks[i];
        state.tShift[i + startLine] = oldTShift[i];
        state.sCount[i + startLine] = oldSCount[i];
        state.bsCount[i + startLine] = oldBSCount[i];
      }
      state.blkIndent = oldIndent;

      return true;
    };

    },{"../common/utils":4}],19:[function(require,module,exports){


    module.exports = function code(state, startLine, endLine/*, silent*/) {
      var nextLine, last, token;

      if (state.sCount[startLine] - state.blkIndent < 4) { return false; }

      last = nextLine = startLine + 1;

      while (nextLine < endLine) {
        if (state.isEmpty(nextLine)) {
          nextLine++;
          continue;
        }

        if (state.sCount[nextLine] - state.blkIndent >= 4) {
          nextLine++;
          last = nextLine;
          continue;
        }
        break;
      }

      state.line = last;

      token         = state.push('code_block', 'code', 0);
      token.content = state.getLines(startLine, last, 4 + state.blkIndent, true);
      token.map     = [ startLine, state.line ];

      return true;
    };

    },{}],20:[function(require,module,exports){


    module.exports = function fence(state, startLine, endLine, silent) {
      var marker, len, params, nextLine, mem, token, markup,
          haveEndMarker = false,
          pos = state.bMarks[startLine] + state.tShift[startLine],
          max = state.eMarks[startLine];

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      if (pos + 3 > max) { return false; }

      marker = state.src.charCodeAt(pos);

      if (marker !== 0x7E/* ~ */ && marker !== 0x60 /* ` */) {
        return false;
      }

      // scan marker length
      mem = pos;
      pos = state.skipChars(pos, marker);

      len = pos - mem;

      if (len < 3) { return false; }

      markup = state.src.slice(mem, pos);
      params = state.src.slice(pos, max);

      if (marker === 0x60 /* ` */) {
        if (params.indexOf(String.fromCharCode(marker)) >= 0) {
          return false;
        }
      }

      // Since start is found, we can report success here in validation mode
      if (silent) { return true; }

      // search end of block
      nextLine = startLine;

      for (;;) {
        nextLine++;
        if (nextLine >= endLine) {
          // unclosed block should be autoclosed by end of document.
          // also block seems to be autoclosed by end of parent
          break;
        }

        pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];

        if (pos < max && state.sCount[nextLine] < state.blkIndent) {
          // non-empty line with negative indent should stop the list:
          // - ```
          //  test
          break;
        }

        if (state.src.charCodeAt(pos) !== marker) { continue; }

        if (state.sCount[nextLine] - state.blkIndent >= 4) {
          // closing fence should be indented less than 4 spaces
          continue;
        }

        pos = state.skipChars(pos, marker);

        // closing code fence must be at least as long as the opening one
        if (pos - mem < len) { continue; }

        // make sure tail has spaces only
        pos = state.skipSpaces(pos);

        if (pos < max) { continue; }

        haveEndMarker = true;
        // found!
        break;
      }

      // If a fence has heading spaces, they should be removed from its inner block
      len = state.sCount[startLine];

      state.line = nextLine + (haveEndMarker ? 1 : 0);

      token         = state.push('fence', 'code', 0);
      token.info    = params;
      token.content = state.getLines(startLine + 1, nextLine, len, true);
      token.markup  = markup;
      token.map     = [ startLine, state.line ];

      return true;
    };

    },{}],21:[function(require,module,exports){

    var isSpace = require('../common/utils').isSpace;


    module.exports = function heading(state, startLine, endLine, silent) {
      var ch, level, tmp, token,
          pos = state.bMarks[startLine] + state.tShift[startLine],
          max = state.eMarks[startLine];

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      ch  = state.src.charCodeAt(pos);

      if (ch !== 0x23/* # */ || pos >= max) { return false; }

      // count heading level
      level = 1;
      ch = state.src.charCodeAt(++pos);
      while (ch === 0x23/* # */ && pos < max && level <= 6) {
        level++;
        ch = state.src.charCodeAt(++pos);
      }

      if (level > 6 || (pos < max && !isSpace(ch))) { return false; }

      if (silent) { return true; }

      // Let's cut tails like '    ###  ' from the end of string

      max = state.skipSpacesBack(max, pos);
      tmp = state.skipCharsBack(max, 0x23, pos); // #
      if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) {
        max = tmp;
      }

      state.line = startLine + 1;

      token        = state.push('heading_open', 'h' + String(level), 1);
      token.markup = '########'.slice(0, level);
      token.map    = [ startLine, state.line ];

      token          = state.push('inline', '', 0);
      token.content  = state.src.slice(pos, max).trim();
      token.map      = [ startLine, state.line ];
      token.children = [];

      token        = state.push('heading_close', 'h' + String(level), -1);
      token.markup = '########'.slice(0, level);

      return true;
    };

    },{"../common/utils":4}],22:[function(require,module,exports){

    var isSpace = require('../common/utils').isSpace;


    module.exports = function hr(state, startLine, endLine, silent) {
      var marker, cnt, ch, token,
          pos = state.bMarks[startLine] + state.tShift[startLine],
          max = state.eMarks[startLine];

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      marker = state.src.charCodeAt(pos++);

      // Check hr marker
      if (marker !== 0x2A/* * */ &&
          marker !== 0x2D/* - */ &&
          marker !== 0x5F/* _ */) {
        return false;
      }

      // markers can be mixed with spaces, but there should be at least 3 of them

      cnt = 1;
      while (pos < max) {
        ch = state.src.charCodeAt(pos++);
        if (ch !== marker && !isSpace(ch)) { return false; }
        if (ch === marker) { cnt++; }
      }

      if (cnt < 3) { return false; }

      if (silent) { return true; }

      state.line = startLine + 1;

      token        = state.push('hr', 'hr', 0);
      token.map    = [ startLine, state.line ];
      token.markup = Array(cnt + 1).join(String.fromCharCode(marker));

      return true;
    };

    },{"../common/utils":4}],23:[function(require,module,exports){


    var block_names = require('../common/html_blocks');
    var HTML_OPEN_CLOSE_TAG_RE = require('../common/html_re').HTML_OPEN_CLOSE_TAG_RE;

    // An array of opening and corresponding closing sequences for html tags,
    // last argument defines whether it can terminate a paragraph or not
    //
    var HTML_SEQUENCES = [
      [ /^<(script|pre|style)(?=(\s|>|$))/i, /<\/(script|pre|style)>/i, true ],
      [ /^<!--/,        /-->/,   true ],
      [ /^<\?/,         /\?>/,   true ],
      [ /^<![A-Z]/,     />/,     true ],
      [ /^<!\[CDATA\[/, /\]\]>/, true ],
      [ new RegExp('^</?(' + block_names.join('|') + ')(?=(\\s|/?>|$))', 'i'), /^$/, true ],
      [ new RegExp(HTML_OPEN_CLOSE_TAG_RE.source + '\\s*$'),  /^$/, false ]
    ];


    module.exports = function html_block(state, startLine, endLine, silent) {
      var i, nextLine, token, lineText,
          pos = state.bMarks[startLine] + state.tShift[startLine],
          max = state.eMarks[startLine];

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      if (!state.md.options.html) { return false; }

      if (state.src.charCodeAt(pos) !== 0x3C/* < */) { return false; }

      lineText = state.src.slice(pos, max);

      for (i = 0; i < HTML_SEQUENCES.length; i++) {
        if (HTML_SEQUENCES[i][0].test(lineText)) { break; }
      }

      if (i === HTML_SEQUENCES.length) { return false; }

      if (silent) {
        // true if this sequence can be a terminator, false otherwise
        return HTML_SEQUENCES[i][2];
      }

      nextLine = startLine + 1;

      // If we are here - we detected HTML block.
      // Let's roll down till block end.
      if (!HTML_SEQUENCES[i][1].test(lineText)) {
        for (; nextLine < endLine; nextLine++) {
          if (state.sCount[nextLine] < state.blkIndent) { break; }

          pos = state.bMarks[nextLine] + state.tShift[nextLine];
          max = state.eMarks[nextLine];
          lineText = state.src.slice(pos, max);

          if (HTML_SEQUENCES[i][1].test(lineText)) {
            if (lineText.length !== 0) { nextLine++; }
            break;
          }
        }
      }

      state.line = nextLine;

      token         = state.push('html_block', '', 0);
      token.map     = [ startLine, nextLine ];
      token.content = state.getLines(startLine, nextLine, state.blkIndent, true);

      return true;
    };

    },{"../common/html_blocks":2,"../common/html_re":3}],24:[function(require,module,exports){


    module.exports = function lheading(state, startLine, endLine/*, silent*/) {
      var content, terminate, i, l, token, pos, max, level, marker,
          nextLine = startLine + 1, oldParentType,
          terminatorRules = state.md.block.ruler.getRules('paragraph');

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      oldParentType = state.parentType;
      state.parentType = 'paragraph'; // use paragraph to match terminatorRules

      // jump line-by-line until empty one or EOF
      for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
        // this would be a code block normally, but after paragraph
        // it's considered a lazy continuation regardless of what's there
        if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }

        //
        // Check for underline in setext header
        //
        if (state.sCount[nextLine] >= state.blkIndent) {
          pos = state.bMarks[nextLine] + state.tShift[nextLine];
          max = state.eMarks[nextLine];

          if (pos < max) {
            marker = state.src.charCodeAt(pos);

            if (marker === 0x2D/* - */ || marker === 0x3D/* = */) {
              pos = state.skipChars(pos, marker);
              pos = state.skipSpaces(pos);

              if (pos >= max) {
                level = (marker === 0x3D/* = */ ? 1 : 2);
                break;
              }
            }
          }
        }

        // quirk for blockquotes, this line should already be checked by that rule
        if (state.sCount[nextLine] < 0) { continue; }

        // Some tags can terminate paragraph without empty line.
        terminate = false;
        for (i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) { break; }
      }

      if (!level) {
        // Didn't find valid underline
        return false;
      }

      content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();

      state.line = nextLine + 1;

      token          = state.push('heading_open', 'h' + String(level), 1);
      token.markup   = String.fromCharCode(marker);
      token.map      = [ startLine, state.line ];

      token          = state.push('inline', '', 0);
      token.content  = content;
      token.map      = [ startLine, state.line - 1 ];
      token.children = [];

      token          = state.push('heading_close', 'h' + String(level), -1);
      token.markup   = String.fromCharCode(marker);

      state.parentType = oldParentType;

      return true;
    };

    },{}],25:[function(require,module,exports){

    var isSpace = require('../common/utils').isSpace;


    // Search `[-+*][\n ]`, returns next pos after marker on success
    // or -1 on fail.
    function skipBulletListMarker(state, startLine) {
      var marker, pos, max, ch;

      pos = state.bMarks[startLine] + state.tShift[startLine];
      max = state.eMarks[startLine];

      marker = state.src.charCodeAt(pos++);
      // Check bullet
      if (marker !== 0x2A/* * */ &&
          marker !== 0x2D/* - */ &&
          marker !== 0x2B/* + */) {
        return -1;
      }

      if (pos < max) {
        ch = state.src.charCodeAt(pos);

        if (!isSpace(ch)) {
          // " -test " - is not a list item
          return -1;
        }
      }

      return pos;
    }

    // Search `\d+[.)][\n ]`, returns next pos after marker on success
    // or -1 on fail.
    function skipOrderedListMarker(state, startLine) {
      var ch,
          start = state.bMarks[startLine] + state.tShift[startLine],
          pos = start,
          max = state.eMarks[startLine];

      // List marker should have at least 2 chars (digit + dot)
      if (pos + 1 >= max) { return -1; }

      ch = state.src.charCodeAt(pos++);

      if (ch < 0x30/* 0 */ || ch > 0x39/* 9 */) { return -1; }

      for (;;) {
        // EOL -> fail
        if (pos >= max) { return -1; }

        ch = state.src.charCodeAt(pos++);

        if (ch >= 0x30/* 0 */ && ch <= 0x39/* 9 */) {

          // List marker should have no more than 9 digits
          // (prevents integer overflow in browsers)
          if (pos - start >= 10) { return -1; }

          continue;
        }

        // found valid marker
        if (ch === 0x29/* ) */ || ch === 0x2e/* . */) {
          break;
        }

        return -1;
      }


      if (pos < max) {
        ch = state.src.charCodeAt(pos);

        if (!isSpace(ch)) {
          // " 1.test " - is not a list item
          return -1;
        }
      }
      return pos;
    }

    function markTightParagraphs(state, idx) {
      var i, l,
          level = state.level + 2;

      for (i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
        if (state.tokens[i].level === level && state.tokens[i].type === 'paragraph_open') {
          state.tokens[i + 2].hidden = true;
          state.tokens[i].hidden = true;
          i += 2;
        }
      }
    }


    module.exports = function list(state, startLine, endLine, silent) {
      var ch,
          contentStart,
          i,
          indent,
          indentAfterMarker,
          initial,
          isOrdered,
          itemLines,
          l,
          listLines,
          listTokIdx,
          markerCharCode,
          markerValue,
          max,
          nextLine,
          offset,
          oldListIndent,
          oldParentType,
          oldSCount,
          oldTShift,
          oldTight,
          pos,
          posAfterMarker,
          prevEmptyEnd,
          start,
          terminate,
          terminatorRules,
          token,
          isTerminatingParagraph = false,
          tight = true;

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      // Special case:
      //  - item 1
      //   - item 2
      //    - item 3
      //     - item 4
      //      - this one is a paragraph continuation
      if (state.listIndent >= 0 &&
          state.sCount[startLine] - state.listIndent >= 4 &&
          state.sCount[startLine] < state.blkIndent) {
        return false;
      }

      // limit conditions when list can interrupt
      // a paragraph (validation mode only)
      if (silent && state.parentType === 'paragraph') {
        // Next list item should still terminate previous list item;
        //
        // This code can fail if plugins use blkIndent as well as lists,
        // but I hope the spec gets fixed long before that happens.
        //
        if (state.tShift[startLine] >= state.blkIndent) {
          isTerminatingParagraph = true;
        }
      }

      // Detect list type and position after marker
      if ((posAfterMarker = skipOrderedListMarker(state, startLine)) >= 0) {
        isOrdered = true;
        start = state.bMarks[startLine] + state.tShift[startLine];
        markerValue = Number(state.src.substr(start, posAfterMarker - start - 1));

        // If we're starting a new ordered list right after
        // a paragraph, it should start with 1.
        if (isTerminatingParagraph && markerValue !== 1) return false;

      } else if ((posAfterMarker = skipBulletListMarker(state, startLine)) >= 0) {
        isOrdered = false;

      } else {
        return false;
      }

      // If we're starting a new unordered list right after
      // a paragraph, first line should not be empty.
      if (isTerminatingParagraph) {
        if (state.skipSpaces(posAfterMarker) >= state.eMarks[startLine]) return false;
      }

      // We should terminate list on style change. Remember first one to compare.
      markerCharCode = state.src.charCodeAt(posAfterMarker - 1);

      // For validation mode we can terminate immediately
      if (silent) { return true; }

      // Start list
      listTokIdx = state.tokens.length;

      if (isOrdered) {
        token       = state.push('ordered_list_open', 'ol', 1);
        if (markerValue !== 1) {
          token.attrs = [ [ 'start', markerValue ] ];
        }

      } else {
        token       = state.push('bullet_list_open', 'ul', 1);
      }

      token.map    = listLines = [ startLine, 0 ];
      token.markup = String.fromCharCode(markerCharCode);

      //
      // Iterate list items
      //

      nextLine = startLine;
      prevEmptyEnd = false;
      terminatorRules = state.md.block.ruler.getRules('list');

      oldParentType = state.parentType;
      state.parentType = 'list';

      while (nextLine < endLine) {
        pos = posAfterMarker;
        max = state.eMarks[nextLine];

        initial = offset = state.sCount[nextLine] + posAfterMarker - (state.bMarks[startLine] + state.tShift[startLine]);

        while (pos < max) {
          ch = state.src.charCodeAt(pos);

          if (ch === 0x09) {
            offset += 4 - (offset + state.bsCount[nextLine]) % 4;
          } else if (ch === 0x20) {
            offset++;
          } else {
            break;
          }

          pos++;
        }

        contentStart = pos;

        if (contentStart >= max) {
          // trimming space in "-    \n  3" case, indent is 1 here
          indentAfterMarker = 1;
        } else {
          indentAfterMarker = offset - initial;
        }

        // If we have more than 4 spaces, the indent is 1
        // (the rest is just indented code block)
        if (indentAfterMarker > 4) { indentAfterMarker = 1; }

        // "  -  test"
        //  ^^^^^ - calculating total length of this thing
        indent = initial + indentAfterMarker;

        // Run subparser & write tokens
        token        = state.push('list_item_open', 'li', 1);
        token.markup = String.fromCharCode(markerCharCode);
        token.map    = itemLines = [ startLine, 0 ];

        // change current state, then restore it after parser subcall
        oldTight = state.tight;
        oldTShift = state.tShift[startLine];
        oldSCount = state.sCount[startLine];

        //  - example list
        // ^ listIndent position will be here
        //   ^ blkIndent position will be here
        //
        oldListIndent = state.listIndent;
        state.listIndent = state.blkIndent;
        state.blkIndent = indent;

        state.tight = true;
        state.tShift[startLine] = contentStart - state.bMarks[startLine];
        state.sCount[startLine] = offset;

        if (contentStart >= max && state.isEmpty(startLine + 1)) {
          // workaround for this case
          // (list item is empty, list terminates before "foo"):
          // ~~~~~~~~
          //   -
          //
          //     foo
          // ~~~~~~~~
          state.line = Math.min(state.line + 2, endLine);
        } else {
          state.md.block.tokenize(state, startLine, endLine, true);
        }

        // If any of list item is tight, mark list as tight
        if (!state.tight || prevEmptyEnd) {
          tight = false;
        }
        // Item become loose if finish with empty line,
        // but we should filter last element, because it means list finish
        prevEmptyEnd = (state.line - startLine) > 1 && state.isEmpty(state.line - 1);

        state.blkIndent = state.listIndent;
        state.listIndent = oldListIndent;
        state.tShift[startLine] = oldTShift;
        state.sCount[startLine] = oldSCount;
        state.tight = oldTight;

        token        = state.push('list_item_close', 'li', -1);
        token.markup = String.fromCharCode(markerCharCode);

        nextLine = startLine = state.line;
        itemLines[1] = nextLine;
        contentStart = state.bMarks[startLine];

        if (nextLine >= endLine) { break; }

        //
        // Try to check if list is terminated or continued.
        //
        if (state.sCount[nextLine] < state.blkIndent) { break; }

        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) { break; }

        // fail if terminating block found
        terminate = false;
        for (i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) { break; }

        // fail if list has another type
        if (isOrdered) {
          posAfterMarker = skipOrderedListMarker(state, nextLine);
          if (posAfterMarker < 0) { break; }
        } else {
          posAfterMarker = skipBulletListMarker(state, nextLine);
          if (posAfterMarker < 0) { break; }
        }

        if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) { break; }
      }

      // Finalize list
      if (isOrdered) {
        token = state.push('ordered_list_close', 'ol', -1);
      } else {
        token = state.push('bullet_list_close', 'ul', -1);
      }
      token.markup = String.fromCharCode(markerCharCode);

      listLines[1] = nextLine;
      state.line = nextLine;

      state.parentType = oldParentType;

      // mark paragraphs tight if needed
      if (tight) {
        markTightParagraphs(state, listTokIdx);
      }

      return true;
    };

    },{"../common/utils":4}],26:[function(require,module,exports){


    module.exports = function paragraph(state, startLine/*, endLine*/) {
      var content, terminate, i, l, token, oldParentType,
          nextLine = startLine + 1,
          terminatorRules = state.md.block.ruler.getRules('paragraph'),
          endLine = state.lineMax;

      oldParentType = state.parentType;
      state.parentType = 'paragraph';

      // jump line-by-line until empty one or EOF
      for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
        // this would be a code block normally, but after paragraph
        // it's considered a lazy continuation regardless of what's there
        if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }

        // quirk for blockquotes, this line should already be checked by that rule
        if (state.sCount[nextLine] < 0) { continue; }

        // Some tags can terminate paragraph without empty line.
        terminate = false;
        for (i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) { break; }
      }

      content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();

      state.line = nextLine;

      token          = state.push('paragraph_open', 'p', 1);
      token.map      = [ startLine, state.line ];

      token          = state.push('inline', '', 0);
      token.content  = content;
      token.map      = [ startLine, state.line ];
      token.children = [];

      token          = state.push('paragraph_close', 'p', -1);

      state.parentType = oldParentType;

      return true;
    };

    },{}],27:[function(require,module,exports){


    var normalizeReference   = require('../common/utils').normalizeReference;
    var isSpace              = require('../common/utils').isSpace;


    module.exports = function reference(state, startLine, _endLine, silent) {
      var ch,
          destEndPos,
          destEndLineNo,
          endLine,
          href,
          i,
          l,
          label,
          labelEnd,
          oldParentType,
          res,
          start,
          str,
          terminate,
          terminatorRules,
          title,
          lines = 0,
          pos = state.bMarks[startLine] + state.tShift[startLine],
          max = state.eMarks[startLine],
          nextLine = startLine + 1;

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      if (state.src.charCodeAt(pos) !== 0x5B/* [ */) { return false; }

      // Simple check to quickly interrupt scan on [link](url) at the start of line.
      // Can be useful on practice: https://github.com/markdown-it/markdown-it/issues/54
      while (++pos < max) {
        if (state.src.charCodeAt(pos) === 0x5D /* ] */ &&
            state.src.charCodeAt(pos - 1) !== 0x5C/* \ */) {
          if (pos + 1 === max) { return false; }
          if (state.src.charCodeAt(pos + 1) !== 0x3A/* : */) { return false; }
          break;
        }
      }

      endLine = state.lineMax;

      // jump line-by-line until empty one or EOF
      terminatorRules = state.md.block.ruler.getRules('reference');

      oldParentType = state.parentType;
      state.parentType = 'reference';

      for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
        // this would be a code block normally, but after paragraph
        // it's considered a lazy continuation regardless of what's there
        if (state.sCount[nextLine] - state.blkIndent > 3) { continue; }

        // quirk for blockquotes, this line should already be checked by that rule
        if (state.sCount[nextLine] < 0) { continue; }

        // Some tags can terminate paragraph without empty line.
        terminate = false;
        for (i = 0, l = terminatorRules.length; i < l; i++) {
          if (terminatorRules[i](state, nextLine, endLine, true)) {
            terminate = true;
            break;
          }
        }
        if (terminate) { break; }
      }

      str = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
      max = str.length;

      for (pos = 1; pos < max; pos++) {
        ch = str.charCodeAt(pos);
        if (ch === 0x5B /* [ */) {
          return false;
        } else if (ch === 0x5D /* ] */) {
          labelEnd = pos;
          break;
        } else if (ch === 0x0A /* \n */) {
          lines++;
        } else if (ch === 0x5C /* \ */) {
          pos++;
          if (pos < max && str.charCodeAt(pos) === 0x0A) {
            lines++;
          }
        }
      }

      if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 0x3A/* : */) { return false; }

      // [label]:   destination   'title'
      //         ^^^ skip optional whitespace here
      for (pos = labelEnd + 2; pos < max; pos++) {
        ch = str.charCodeAt(pos);
        if (ch === 0x0A) {
          lines++;
        } else if (isSpace(ch)) ; else {
          break;
        }
      }

      // [label]:   destination   'title'
      //            ^^^^^^^^^^^ parse this
      res = state.md.helpers.parseLinkDestination(str, pos, max);
      if (!res.ok) { return false; }

      href = state.md.normalizeLink(res.str);
      if (!state.md.validateLink(href)) { return false; }

      pos = res.pos;
      lines += res.lines;

      // save cursor state, we could require to rollback later
      destEndPos = pos;
      destEndLineNo = lines;

      // [label]:   destination   'title'
      //                       ^^^ skipping those spaces
      start = pos;
      for (; pos < max; pos++) {
        ch = str.charCodeAt(pos);
        if (ch === 0x0A) {
          lines++;
        } else if (isSpace(ch)) ; else {
          break;
        }
      }

      // [label]:   destination   'title'
      //                          ^^^^^^^ parse this
      res = state.md.helpers.parseLinkTitle(str, pos, max);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        lines += res.lines;
      } else {
        title = '';
        pos = destEndPos;
        lines = destEndLineNo;
      }

      // skip trailing spaces until the rest of the line
      while (pos < max) {
        ch = str.charCodeAt(pos);
        if (!isSpace(ch)) { break; }
        pos++;
      }

      if (pos < max && str.charCodeAt(pos) !== 0x0A) {
        if (title) {
          // garbage at the end of the line after title,
          // but it could still be a valid reference if we roll back
          title = '';
          pos = destEndPos;
          lines = destEndLineNo;
          while (pos < max) {
            ch = str.charCodeAt(pos);
            if (!isSpace(ch)) { break; }
            pos++;
          }
        }
      }

      if (pos < max && str.charCodeAt(pos) !== 0x0A) {
        // garbage at the end of the line
        return false;
      }

      label = normalizeReference(str.slice(1, labelEnd));
      if (!label) {
        // CommonMark 0.20 disallows empty labels
        return false;
      }

      // Reference can not terminate anything. This check is for safety only.
      /*istanbul ignore if*/
      if (silent) { return true; }

      if (typeof state.env.references === 'undefined') {
        state.env.references = {};
      }
      if (typeof state.env.references[label] === 'undefined') {
        state.env.references[label] = { title: title, href: href };
      }

      state.parentType = oldParentType;

      state.line = startLine + lines + 1;
      return true;
    };

    },{"../common/utils":4}],28:[function(require,module,exports){

    var Token = require('../token');
    var isSpace = require('../common/utils').isSpace;


    function StateBlock(src, md, env, tokens) {
      var ch, s, start, pos, len, indent, offset, indent_found;

      this.src = src;

      // link to parser instance
      this.md     = md;

      this.env = env;

      //
      // Internal state vartiables
      //

      this.tokens = tokens;

      this.bMarks = [];  // line begin offsets for fast jumps
      this.eMarks = [];  // line end offsets for fast jumps
      this.tShift = [];  // offsets of the first non-space characters (tabs not expanded)
      this.sCount = [];  // indents for each line (tabs expanded)

      // An amount of virtual spaces (tabs expanded) between beginning
      // of each line (bMarks) and real beginning of that line.
      //
      // It exists only as a hack because blockquotes override bMarks
      // losing information in the process.
      //
      // It's used only when expanding tabs, you can think about it as
      // an initial tab length, e.g. bsCount=21 applied to string `\t123`
      // means first tab should be expanded to 4-21%4 === 3 spaces.
      //
      this.bsCount = [];

      // block parser variables
      this.blkIndent  = 0; // required block content indent (for example, if we are
                           // inside a list, it would be positioned after list marker)
      this.line       = 0; // line index in src
      this.lineMax    = 0; // lines count
      this.tight      = false;  // loose/tight mode for lists
      this.ddIndent   = -1; // indent of the current dd block (-1 if there isn't any)
      this.listIndent = -1; // indent of the current list block (-1 if there isn't any)

      // can be 'blockquote', 'list', 'root', 'paragraph' or 'reference'
      // used in lists to determine if they interrupt a paragraph
      this.parentType = 'root';

      this.level = 0;

      // renderer
      this.result = '';

      // Create caches
      // Generate markers.
      s = this.src;
      indent_found = false;

      for (start = pos = indent = offset = 0, len = s.length; pos < len; pos++) {
        ch = s.charCodeAt(pos);

        if (!indent_found) {
          if (isSpace(ch)) {
            indent++;

            if (ch === 0x09) {
              offset += 4 - offset % 4;
            } else {
              offset++;
            }
            continue;
          } else {
            indent_found = true;
          }
        }

        if (ch === 0x0A || pos === len - 1) {
          if (ch !== 0x0A) { pos++; }
          this.bMarks.push(start);
          this.eMarks.push(pos);
          this.tShift.push(indent);
          this.sCount.push(offset);
          this.bsCount.push(0);

          indent_found = false;
          indent = 0;
          offset = 0;
          start = pos + 1;
        }
      }

      // Push fake entry to simplify cache bounds checks
      this.bMarks.push(s.length);
      this.eMarks.push(s.length);
      this.tShift.push(0);
      this.sCount.push(0);
      this.bsCount.push(0);

      this.lineMax = this.bMarks.length - 1; // don't count last fake line
    }

    // Push new token to "stream".
    //
    StateBlock.prototype.push = function (type, tag, nesting) {
      var token = new Token(type, tag, nesting);
      token.block = true;

      if (nesting < 0) this.level--; // closing tag
      token.level = this.level;
      if (nesting > 0) this.level++; // opening tag

      this.tokens.push(token);
      return token;
    };

    StateBlock.prototype.isEmpty = function isEmpty(line) {
      return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
    };

    StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
      for (var max = this.lineMax; from < max; from++) {
        if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
          break;
        }
      }
      return from;
    };

    // Skip spaces from given position.
    StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
      var ch;

      for (var max = this.src.length; pos < max; pos++) {
        ch = this.src.charCodeAt(pos);
        if (!isSpace(ch)) { break; }
      }
      return pos;
    };

    // Skip spaces from given position in reverse.
    StateBlock.prototype.skipSpacesBack = function skipSpacesBack(pos, min) {
      if (pos <= min) { return pos; }

      while (pos > min) {
        if (!isSpace(this.src.charCodeAt(--pos))) { return pos + 1; }
      }
      return pos;
    };

    // Skip char codes from given position
    StateBlock.prototype.skipChars = function skipChars(pos, code) {
      for (var max = this.src.length; pos < max; pos++) {
        if (this.src.charCodeAt(pos) !== code) { break; }
      }
      return pos;
    };

    // Skip char codes reverse from given position - 1
    StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code, min) {
      if (pos <= min) { return pos; }

      while (pos > min) {
        if (code !== this.src.charCodeAt(--pos)) { return pos + 1; }
      }
      return pos;
    };

    // cut lines range from source.
    StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
      var i, lineIndent, ch, first, last, queue, lineStart,
          line = begin;

      if (begin >= end) {
        return '';
      }

      queue = new Array(end - begin);

      for (i = 0; line < end; line++, i++) {
        lineIndent = 0;
        lineStart = first = this.bMarks[line];

        if (line + 1 < end || keepLastLF) {
          // No need for bounds check because we have fake entry on tail.
          last = this.eMarks[line] + 1;
        } else {
          last = this.eMarks[line];
        }

        while (first < last && lineIndent < indent) {
          ch = this.src.charCodeAt(first);

          if (isSpace(ch)) {
            if (ch === 0x09) {
              lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
            } else {
              lineIndent++;
            }
          } else if (first - lineStart < this.tShift[line]) {
            // patched tShift masked characters to look like spaces (blockquotes, list markers)
            lineIndent++;
          } else {
            break;
          }

          first++;
        }

        if (lineIndent > indent) {
          // partially expanding tabs in code blocks, e.g '\t\tfoobar'
          // with indent=2 becomes '  \tfoobar'
          queue[i] = new Array(lineIndent - indent + 1).join(' ') + this.src.slice(first, last);
        } else {
          queue[i] = this.src.slice(first, last);
        }
      }

      return queue.join('');
    };

    // re-export Token class to use in block rules
    StateBlock.prototype.Token = Token;


    module.exports = StateBlock;

    },{"../common/utils":4,"../token":51}],29:[function(require,module,exports){

    var isSpace = require('../common/utils').isSpace;


    function getLine(state, line) {
      var pos = state.bMarks[line] + state.blkIndent,
          max = state.eMarks[line];

      return state.src.substr(pos, max - pos);
    }

    function escapedSplit(str) {
      var result = [],
          pos = 0,
          max = str.length,
          ch,
          escapes = 0,
          lastPos = 0,
          backTicked = false,
          lastBackTick = 0;

      ch  = str.charCodeAt(pos);

      while (pos < max) {
        if (ch === 0x60/* ` */) {
          if (backTicked) {
            // make \` close code sequence, but not open it;
            // the reason is: `\` is correct code block
            backTicked = false;
            lastBackTick = pos;
          } else if (escapes % 2 === 0) {
            backTicked = true;
            lastBackTick = pos;
          }
        } else if (ch === 0x7c/* | */ && (escapes % 2 === 0) && !backTicked) {
          result.push(str.substring(lastPos, pos));
          lastPos = pos + 1;
        }

        if (ch === 0x5c/* \ */) {
          escapes++;
        } else {
          escapes = 0;
        }

        pos++;

        // If there was an un-closed backtick, go back to just after
        // the last backtick, but as if it was a normal character
        if (pos === max && backTicked) {
          backTicked = false;
          pos = lastBackTick + 1;
        }

        ch = str.charCodeAt(pos);
      }

      result.push(str.substring(lastPos));

      return result;
    }


    module.exports = function table(state, startLine, endLine, silent) {
      var ch, lineText, pos, i, nextLine, columns, columnCount, token,
          aligns, t, tableLines, tbodyLines;

      // should have at least two lines
      if (startLine + 2 > endLine) { return false; }

      nextLine = startLine + 1;

      if (state.sCount[nextLine] < state.blkIndent) { return false; }

      // if it's indented more than 3 spaces, it should be a code block
      if (state.sCount[nextLine] - state.blkIndent >= 4) { return false; }

      // first character of the second line should be '|', '-', ':',
      // and no other characters are allowed but spaces;
      // basically, this is the equivalent of /^[-:|][-:|\s]*$/ regexp

      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      if (pos >= state.eMarks[nextLine]) { return false; }

      ch = state.src.charCodeAt(pos++);
      if (ch !== 0x7C/* | */ && ch !== 0x2D/* - */ && ch !== 0x3A/* : */) { return false; }

      while (pos < state.eMarks[nextLine]) {
        ch = state.src.charCodeAt(pos);

        if (ch !== 0x7C/* | */ && ch !== 0x2D/* - */ && ch !== 0x3A/* : */ && !isSpace(ch)) { return false; }

        pos++;
      }

      lineText = getLine(state, startLine + 1);

      columns = lineText.split('|');
      aligns = [];
      for (i = 0; i < columns.length; i++) {
        t = columns[i].trim();
        if (!t) {
          // allow empty columns before and after table, but not in between columns;
          // e.g. allow ` |---| `, disallow ` ---||--- `
          if (i === 0 || i === columns.length - 1) {
            continue;
          } else {
            return false;
          }
        }

        if (!/^:?-+:?$/.test(t)) { return false; }
        if (t.charCodeAt(t.length - 1) === 0x3A/* : */) {
          aligns.push(t.charCodeAt(0) === 0x3A/* : */ ? 'center' : 'right');
        } else if (t.charCodeAt(0) === 0x3A/* : */) {
          aligns.push('left');
        } else {
          aligns.push('');
        }
      }

      lineText = getLine(state, startLine).trim();
      if (lineText.indexOf('|') === -1) { return false; }
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }
      columns = escapedSplit(lineText.replace(/^\||\|$/g, ''));

      // header row will define an amount of columns in the entire table,
      // and align row shouldn't be smaller than that (the rest of the rows can)
      columnCount = columns.length;
      if (columnCount > aligns.length) { return false; }

      if (silent) { return true; }

      token     = state.push('table_open', 'table', 1);
      token.map = tableLines = [ startLine, 0 ];

      token     = state.push('thead_open', 'thead', 1);
      token.map = [ startLine, startLine + 1 ];

      token     = state.push('tr_open', 'tr', 1);
      token.map = [ startLine, startLine + 1 ];

      for (i = 0; i < columns.length; i++) {
        token          = state.push('th_open', 'th', 1);
        token.map      = [ startLine, startLine + 1 ];
        if (aligns[i]) {
          token.attrs  = [ [ 'style', 'text-align:' + aligns[i] ] ];
        }

        token          = state.push('inline', '', 0);
        token.content  = columns[i].trim();
        token.map      = [ startLine, startLine + 1 ];
        token.children = [];

        token          = state.push('th_close', 'th', -1);
      }

      token     = state.push('tr_close', 'tr', -1);
      token     = state.push('thead_close', 'thead', -1);

      token     = state.push('tbody_open', 'tbody', 1);
      token.map = tbodyLines = [ startLine + 2, 0 ];

      for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
        if (state.sCount[nextLine] < state.blkIndent) { break; }

        lineText = getLine(state, nextLine).trim();
        if (lineText.indexOf('|') === -1) { break; }
        if (state.sCount[nextLine] - state.blkIndent >= 4) { break; }
        columns = escapedSplit(lineText.replace(/^\||\|$/g, ''));

        token = state.push('tr_open', 'tr', 1);
        for (i = 0; i < columnCount; i++) {
          token          = state.push('td_open', 'td', 1);
          if (aligns[i]) {
            token.attrs  = [ [ 'style', 'text-align:' + aligns[i] ] ];
          }

          token          = state.push('inline', '', 0);
          token.content  = columns[i] ? columns[i].trim() : '';
          token.children = [];

          token          = state.push('td_close', 'td', -1);
        }
        token = state.push('tr_close', 'tr', -1);
      }
      token = state.push('tbody_close', 'tbody', -1);
      token = state.push('table_close', 'table', -1);

      tableLines[1] = tbodyLines[1] = nextLine;
      state.line = nextLine;
      return true;
    };

    },{"../common/utils":4}],30:[function(require,module,exports){


    module.exports = function block(state) {
      var token;

      if (state.inlineMode) {
        token          = new state.Token('inline', '', 0);
        token.content  = state.src;
        token.map      = [ 0, 1 ];
        token.children = [];
        state.tokens.push(token);
      } else {
        state.md.block.parse(state.src, state.md, state.env, state.tokens);
      }
    };

    },{}],31:[function(require,module,exports){

    module.exports = function inline(state) {
      var tokens = state.tokens, tok, i, l;

      // Parse inlines
      for (i = 0, l = tokens.length; i < l; i++) {
        tok = tokens[i];
        if (tok.type === 'inline') {
          state.md.inline.parse(tok.content, state.md, state.env, tok.children);
        }
      }
    };

    },{}],32:[function(require,module,exports){


    var arrayReplaceAt = require('../common/utils').arrayReplaceAt;


    function isLinkOpen(str) {
      return /^<a[>\s]/i.test(str);
    }
    function isLinkClose(str) {
      return /^<\/a\s*>/i.test(str);
    }


    module.exports = function linkify(state) {
      var i, j, l, tokens, token, currentToken, nodes, ln, text, pos, lastPos,
          level, htmlLinkLevel, url, fullUrl, urlText,
          blockTokens = state.tokens,
          links;

      if (!state.md.options.linkify) { return; }

      for (j = 0, l = blockTokens.length; j < l; j++) {
        if (blockTokens[j].type !== 'inline' ||
            !state.md.linkify.pretest(blockTokens[j].content)) {
          continue;
        }

        tokens = blockTokens[j].children;

        htmlLinkLevel = 0;

        // We scan from the end, to keep position when new tags added.
        // Use reversed logic in links start/end match
        for (i = tokens.length - 1; i >= 0; i--) {
          currentToken = tokens[i];

          // Skip content of markdown links
          if (currentToken.type === 'link_close') {
            i--;
            while (tokens[i].level !== currentToken.level && tokens[i].type !== 'link_open') {
              i--;
            }
            continue;
          }

          // Skip content of html tag links
          if (currentToken.type === 'html_inline') {
            if (isLinkOpen(currentToken.content) && htmlLinkLevel > 0) {
              htmlLinkLevel--;
            }
            if (isLinkClose(currentToken.content)) {
              htmlLinkLevel++;
            }
          }
          if (htmlLinkLevel > 0) { continue; }

          if (currentToken.type === 'text' && state.md.linkify.test(currentToken.content)) {

            text = currentToken.content;
            links = state.md.linkify.match(text);

            // Now split string to nodes
            nodes = [];
            level = currentToken.level;
            lastPos = 0;

            for (ln = 0; ln < links.length; ln++) {

              url = links[ln].url;
              fullUrl = state.md.normalizeLink(url);
              if (!state.md.validateLink(fullUrl)) { continue; }

              urlText = links[ln].text;

              // Linkifier might send raw hostnames like "example.com", where url
              // starts with domain name. So we prepend http:// in those cases,
              // and remove it afterwards.
              //
              if (!links[ln].schema) {
                urlText = state.md.normalizeLinkText('http://' + urlText).replace(/^http:\/\//, '');
              } else if (links[ln].schema === 'mailto:' && !/^mailto:/i.test(urlText)) {
                urlText = state.md.normalizeLinkText('mailto:' + urlText).replace(/^mailto:/, '');
              } else {
                urlText = state.md.normalizeLinkText(urlText);
              }

              pos = links[ln].index;

              if (pos > lastPos) {
                token         = new state.Token('text', '', 0);
                token.content = text.slice(lastPos, pos);
                token.level   = level;
                nodes.push(token);
              }

              token         = new state.Token('link_open', 'a', 1);
              token.attrs   = [ [ 'href', fullUrl ] ];
              token.level   = level++;
              token.markup  = 'linkify';
              token.info    = 'auto';
              nodes.push(token);

              token         = new state.Token('text', '', 0);
              token.content = urlText;
              token.level   = level;
              nodes.push(token);

              token         = new state.Token('link_close', 'a', -1);
              token.level   = --level;
              token.markup  = 'linkify';
              token.info    = 'auto';
              nodes.push(token);

              lastPos = links[ln].lastIndex;
            }
            if (lastPos < text.length) {
              token         = new state.Token('text', '', 0);
              token.content = text.slice(lastPos);
              token.level   = level;
              nodes.push(token);
            }

            // replace current node
            blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
          }
        }
      }
    };

    },{"../common/utils":4}],33:[function(require,module,exports){


    // https://spec.commonmark.org/0.29/#line-ending
    var NEWLINES_RE  = /\r\n?|\n/g;
    var NULL_RE      = /\0/g;


    module.exports = function normalize(state) {
      var str;

      // Normalize newlines
      str = state.src.replace(NEWLINES_RE, '\n');

      // Replace NULL characters
      str = str.replace(NULL_RE, '\uFFFD');

      state.src = str;
    };

    },{}],34:[function(require,module,exports){

    // TODO:
    // - fractionals 1/2, 1/4, 3/4 -> ½, ¼, ¾
    // - miltiplication 2 x 4 -> 2 × 4

    var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;

    // Workaround for phantomjs - need regex without /g flag,
    // or root check will fail every second time
    var SCOPED_ABBR_TEST_RE = /\((c|tm|r|p)\)/i;

    var SCOPED_ABBR_RE = /\((c|tm|r|p)\)/ig;
    var SCOPED_ABBR = {
      c: '©',
      r: '®',
      p: '§',
      tm: '™'
    };

    function replaceFn(match, name) {
      return SCOPED_ABBR[name.toLowerCase()];
    }

    function replace_scoped(inlineTokens) {
      var i, token, inside_autolink = 0;

      for (i = inlineTokens.length - 1; i >= 0; i--) {
        token = inlineTokens[i];

        if (token.type === 'text' && !inside_autolink) {
          token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
        }

        if (token.type === 'link_open' && token.info === 'auto') {
          inside_autolink--;
        }

        if (token.type === 'link_close' && token.info === 'auto') {
          inside_autolink++;
        }
      }
    }

    function replace_rare(inlineTokens) {
      var i, token, inside_autolink = 0;

      for (i = inlineTokens.length - 1; i >= 0; i--) {
        token = inlineTokens[i];

        if (token.type === 'text' && !inside_autolink) {
          if (RARE_RE.test(token.content)) {
            token.content = token.content
              .replace(/\+-/g, '±')
              // .., ..., ....... -> …
              // but ?..... & !..... -> ?.. & !..
              .replace(/\.{2,}/g, '…').replace(/([?!])…/g, '$1..')
              .replace(/([?!]){4,}/g, '$1$1$1').replace(/,{2,}/g, ',')
              // em-dash
              .replace(/(^|[^-])---([^-]|$)/mg, '$1\u2014$2')
              // en-dash
              .replace(/(^|\s)--(\s|$)/mg, '$1\u2013$2')
              .replace(/(^|[^-\s])--([^-\s]|$)/mg, '$1\u2013$2');
          }
        }

        if (token.type === 'link_open' && token.info === 'auto') {
          inside_autolink--;
        }

        if (token.type === 'link_close' && token.info === 'auto') {
          inside_autolink++;
        }
      }
    }


    module.exports = function replace(state) {
      var blkIdx;

      if (!state.md.options.typographer) { return; }

      for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {

        if (state.tokens[blkIdx].type !== 'inline') { continue; }

        if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
          replace_scoped(state.tokens[blkIdx].children);
        }

        if (RARE_RE.test(state.tokens[blkIdx].content)) {
          replace_rare(state.tokens[blkIdx].children);
        }

      }
    };

    },{}],35:[function(require,module,exports){


    var isWhiteSpace   = require('../common/utils').isWhiteSpace;
    var isPunctChar    = require('../common/utils').isPunctChar;
    var isMdAsciiPunct = require('../common/utils').isMdAsciiPunct;

    var QUOTE_TEST_RE = /['"]/;
    var QUOTE_RE = /['"]/g;
    var APOSTROPHE = '\u2019'; /* ’ */


    function replaceAt(str, index, ch) {
      return str.substr(0, index) + ch + str.substr(index + 1);
    }

    function process_inlines(tokens, state) {
      var i, token, text, t, pos, max, thisLevel, item, lastChar, nextChar,
          isLastPunctChar, isNextPunctChar, isLastWhiteSpace, isNextWhiteSpace,
          canOpen, canClose, j, isSingle, stack, openQuote, closeQuote;

      stack = [];

      for (i = 0; i < tokens.length; i++) {
        token = tokens[i];

        thisLevel = tokens[i].level;

        for (j = stack.length - 1; j >= 0; j--) {
          if (stack[j].level <= thisLevel) { break; }
        }
        stack.length = j + 1;

        if (token.type !== 'text') { continue; }

        text = token.content;
        pos = 0;
        max = text.length;

        /*eslint no-labels:0,block-scoped-var:0*/
        OUTER:
        while (pos < max) {
          QUOTE_RE.lastIndex = pos;
          t = QUOTE_RE.exec(text);
          if (!t) { break; }

          canOpen = canClose = true;
          pos = t.index + 1;
          isSingle = (t[0] === "'");

          // Find previous character,
          // default to space if it's the beginning of the line
          //
          lastChar = 0x20;

          if (t.index - 1 >= 0) {
            lastChar = text.charCodeAt(t.index - 1);
          } else {
            for (j = i - 1; j >= 0; j--) {
              if (tokens[j].type === 'softbreak' || tokens[j].type === 'hardbreak') break; // lastChar defaults to 0x20
              if (tokens[j].type !== 'text') continue;

              lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
              break;
            }
          }

          // Find next character,
          // default to space if it's the end of the line
          //
          nextChar = 0x20;

          if (pos < max) {
            nextChar = text.charCodeAt(pos);
          } else {
            for (j = i + 1; j < tokens.length; j++) {
              if (tokens[j].type === 'softbreak' || tokens[j].type === 'hardbreak') break; // nextChar defaults to 0x20
              if (tokens[j].type !== 'text') continue;

              nextChar = tokens[j].content.charCodeAt(0);
              break;
            }
          }

          isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
          isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));

          isLastWhiteSpace = isWhiteSpace(lastChar);
          isNextWhiteSpace = isWhiteSpace(nextChar);

          if (isNextWhiteSpace) {
            canOpen = false;
          } else if (isNextPunctChar) {
            if (!(isLastWhiteSpace || isLastPunctChar)) {
              canOpen = false;
            }
          }

          if (isLastWhiteSpace) {
            canClose = false;
          } else if (isLastPunctChar) {
            if (!(isNextWhiteSpace || isNextPunctChar)) {
              canClose = false;
            }
          }

          if (nextChar === 0x22 /* " */ && t[0] === '"') {
            if (lastChar >= 0x30 /* 0 */ && lastChar <= 0x39 /* 9 */) {
              // special case: 1"" - count first quote as an inch
              canClose = canOpen = false;
            }
          }

          if (canOpen && canClose) {
            // treat this as the middle of the word
            canOpen = false;
            canClose = isNextPunctChar;
          }

          if (!canOpen && !canClose) {
            // middle of word
            if (isSingle) {
              token.content = replaceAt(token.content, t.index, APOSTROPHE);
            }
            continue;
          }

          if (canClose) {
            // this could be a closing quote, rewind the stack to get a match
            for (j = stack.length - 1; j >= 0; j--) {
              item = stack[j];
              if (stack[j].level < thisLevel) { break; }
              if (item.single === isSingle && stack[j].level === thisLevel) {
                item = stack[j];

                if (isSingle) {
                  openQuote = state.md.options.quotes[2];
                  closeQuote = state.md.options.quotes[3];
                } else {
                  openQuote = state.md.options.quotes[0];
                  closeQuote = state.md.options.quotes[1];
                }

                // replace token.content *before* tokens[item.token].content,
                // because, if they are pointing at the same token, replaceAt
                // could mess up indices when quote length != 1
                token.content = replaceAt(token.content, t.index, closeQuote);
                tokens[item.token].content = replaceAt(
                  tokens[item.token].content, item.pos, openQuote);

                pos += closeQuote.length - 1;
                if (item.token === i) { pos += openQuote.length - 1; }

                text = token.content;
                max = text.length;

                stack.length = j;
                continue OUTER;
              }
            }
          }

          if (canOpen) {
            stack.push({
              token: i,
              pos: t.index,
              single: isSingle,
              level: thisLevel
            });
          } else if (canClose && isSingle) {
            token.content = replaceAt(token.content, t.index, APOSTROPHE);
          }
        }
      }
    }


    module.exports = function smartquotes(state) {
      /*eslint max-depth:0*/
      var blkIdx;

      if (!state.md.options.typographer) { return; }

      for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {

        if (state.tokens[blkIdx].type !== 'inline' ||
            !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
          continue;
        }

        process_inlines(state.tokens[blkIdx].children, state);
      }
    };

    },{"../common/utils":4}],36:[function(require,module,exports){

    var Token = require('../token');


    function StateCore(src, md, env) {
      this.src = src;
      this.env = env;
      this.tokens = [];
      this.inlineMode = false;
      this.md = md; // link to parser instance
    }

    // re-export Token class to use in core rules
    StateCore.prototype.Token = Token;


    module.exports = StateCore;

    },{"../token":51}],37:[function(require,module,exports){


    /*eslint max-len:0*/
    var EMAIL_RE    = /^<([a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;
    var AUTOLINK_RE = /^<([a-zA-Z][a-zA-Z0-9+.\-]{1,31}):([^<>\x00-\x20]*)>/;


    module.exports = function autolink(state, silent) {
      var tail, linkMatch, emailMatch, url, fullUrl, token,
          pos = state.pos;

      if (state.src.charCodeAt(pos) !== 0x3C/* < */) { return false; }

      tail = state.src.slice(pos);

      if (tail.indexOf('>') < 0) { return false; }

      if (AUTOLINK_RE.test(tail)) {
        linkMatch = tail.match(AUTOLINK_RE);

        url = linkMatch[0].slice(1, -1);
        fullUrl = state.md.normalizeLink(url);
        if (!state.md.validateLink(fullUrl)) { return false; }

        if (!silent) {
          token         = state.push('link_open', 'a', 1);
          token.attrs   = [ [ 'href', fullUrl ] ];
          token.markup  = 'autolink';
          token.info    = 'auto';

          token         = state.push('text', '', 0);
          token.content = state.md.normalizeLinkText(url);

          token         = state.push('link_close', 'a', -1);
          token.markup  = 'autolink';
          token.info    = 'auto';
        }

        state.pos += linkMatch[0].length;
        return true;
      }

      if (EMAIL_RE.test(tail)) {
        emailMatch = tail.match(EMAIL_RE);

        url = emailMatch[0].slice(1, -1);
        fullUrl = state.md.normalizeLink('mailto:' + url);
        if (!state.md.validateLink(fullUrl)) { return false; }

        if (!silent) {
          token         = state.push('link_open', 'a', 1);
          token.attrs   = [ [ 'href', fullUrl ] ];
          token.markup  = 'autolink';
          token.info    = 'auto';

          token         = state.push('text', '', 0);
          token.content = state.md.normalizeLinkText(url);

          token         = state.push('link_close', 'a', -1);
          token.markup  = 'autolink';
          token.info    = 'auto';
        }

        state.pos += emailMatch[0].length;
        return true;
      }

      return false;
    };

    },{}],38:[function(require,module,exports){

    module.exports = function backtick(state, silent) {
      var start, max, marker, matchStart, matchEnd, token,
          pos = state.pos,
          ch = state.src.charCodeAt(pos);

      if (ch !== 0x60/* ` */) { return false; }

      start = pos;
      pos++;
      max = state.posMax;

      while (pos < max && state.src.charCodeAt(pos) === 0x60/* ` */) { pos++; }

      marker = state.src.slice(start, pos);

      matchStart = matchEnd = pos;

      while ((matchStart = state.src.indexOf('`', matchEnd)) !== -1) {
        matchEnd = matchStart + 1;

        while (matchEnd < max && state.src.charCodeAt(matchEnd) === 0x60/* ` */) { matchEnd++; }

        if (matchEnd - matchStart === marker.length) {
          if (!silent) {
            token         = state.push('code_inline', 'code', 0);
            token.markup  = marker;
            token.content = state.src.slice(pos, matchStart)
              .replace(/\n/g, ' ')
              .replace(/^ (.+) $/, '$1');
          }
          state.pos = matchEnd;
          return true;
        }
      }

      if (!silent) { state.pending += marker; }
      state.pos += marker.length;
      return true;
    };

    },{}],39:[function(require,module,exports){


    function processDelimiters(state, delimiters) {
      var closerIdx, openerIdx, closer, opener, minOpenerIdx, newMinOpenerIdx,
          isOddMatch, lastJump,
          openersBottom = {},
          max = delimiters.length;

      for (closerIdx = 0; closerIdx < max; closerIdx++) {
        closer = delimiters[closerIdx];

        // Length is only used for emphasis-specific "rule of 3",
        // if it's not defined (in strikethrough or 3rd party plugins),
        // we can default it to 0 to disable those checks.
        //
        closer.length = closer.length || 0;

        if (!closer.close) continue;

        // Previously calculated lower bounds (previous fails)
        // for each marker and each delimiter length modulo 3.
        if (!openersBottom.hasOwnProperty(closer.marker)) {
          openersBottom[closer.marker] = [ -1, -1, -1 ];
        }

        minOpenerIdx = openersBottom[closer.marker][closer.length % 3];
        newMinOpenerIdx = -1;

        openerIdx = closerIdx - closer.jump - 1;

        for (; openerIdx > minOpenerIdx; openerIdx -= opener.jump + 1) {
          opener = delimiters[openerIdx];

          if (opener.marker !== closer.marker) continue;

          if (newMinOpenerIdx === -1) newMinOpenerIdx = openerIdx;

          if (opener.open &&
              opener.end < 0 &&
              opener.level === closer.level) {

            isOddMatch = false;

            // from spec:
            //
            // If one of the delimiters can both open and close emphasis, then the
            // sum of the lengths of the delimiter runs containing the opening and
            // closing delimiters must not be a multiple of 3 unless both lengths
            // are multiples of 3.
            //
            if (opener.close || closer.open) {
              if ((opener.length + closer.length) % 3 === 0) {
                if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
                  isOddMatch = true;
                }
              }
            }

            if (!isOddMatch) {
              // If previous delimiter cannot be an opener, we can safely skip
              // the entire sequence in future checks. This is required to make
              // sure algorithm has linear complexity (see *_*_*_*_*_... case).
              //
              lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ?
                delimiters[openerIdx - 1].jump + 1 :
                0;

              closer.jump  = closerIdx - openerIdx + lastJump;
              closer.open  = false;
              opener.end   = closerIdx;
              opener.jump  = lastJump;
              opener.close = false;
              newMinOpenerIdx = -1;
              break;
            }
          }
        }

        if (newMinOpenerIdx !== -1) {
          // If match for this delimiter run failed, we want to set lower bound for
          // future lookups. This is required to make sure algorithm has linear
          // complexity.
          //
          // See details here:
          // https://github.com/commonmark/cmark/issues/178#issuecomment-270417442
          //
          openersBottom[closer.marker][(closer.length || 0) % 3] = newMinOpenerIdx;
        }
      }
    }


    module.exports = function link_pairs(state) {
      var curr,
          tokens_meta = state.tokens_meta,
          max = state.tokens_meta.length;

      processDelimiters(state, state.delimiters);

      for (curr = 0; curr < max; curr++) {
        if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
          processDelimiters(state, tokens_meta[curr].delimiters);
        }
      }
    };

    },{}],40:[function(require,module,exports){


    // Insert each marker as a separate text token, and add it to delimiter list
    //
    module.exports.tokenize = function emphasis(state, silent) {
      var i, scanned, token,
          start = state.pos,
          marker = state.src.charCodeAt(start);

      if (silent) { return false; }

      if (marker !== 0x5F /* _ */ && marker !== 0x2A /* * */) { return false; }

      scanned = state.scanDelims(state.pos, marker === 0x2A);

      for (i = 0; i < scanned.length; i++) {
        token         = state.push('text', '', 0);
        token.content = String.fromCharCode(marker);

        state.delimiters.push({
          // Char code of the starting marker (number).
          //
          marker: marker,

          // Total length of these series of delimiters.
          //
          length: scanned.length,

          // An amount of characters before this one that's equivalent to
          // current one. In plain English: if this delimiter does not open
          // an emphasis, neither do previous `jump` characters.
          //
          // Used to skip sequences like "*****" in one step, for 1st asterisk
          // value will be 0, for 2nd it's 1 and so on.
          //
          jump:   i,

          // A position of the token this delimiter corresponds to.
          //
          token:  state.tokens.length - 1,

          // If this delimiter is matched as a valid opener, `end` will be
          // equal to its position, otherwise it's `-1`.
          //
          end:    -1,

          // Boolean flags that determine if this delimiter could open or close
          // an emphasis.
          //
          open:   scanned.can_open,
          close:  scanned.can_close
        });
      }

      state.pos += scanned.length;

      return true;
    };


    function postProcess(state, delimiters) {
      var i,
          startDelim,
          endDelim,
          token,
          ch,
          isStrong,
          max = delimiters.length;

      for (i = max - 1; i >= 0; i--) {
        startDelim = delimiters[i];

        if (startDelim.marker !== 0x5F/* _ */ && startDelim.marker !== 0x2A/* * */) {
          continue;
        }

        // Process only opening markers
        if (startDelim.end === -1) {
          continue;
        }

        endDelim = delimiters[startDelim.end];

        // If the previous delimiter has the same marker and is adjacent to this one,
        // merge those into one strong delimiter.
        //
        // `<em><em>whatever</em></em>` -> `<strong>whatever</strong>`
        //
        isStrong = i > 0 &&
                   delimiters[i - 1].end === startDelim.end + 1 &&
                   delimiters[i - 1].token === startDelim.token - 1 &&
                   delimiters[startDelim.end + 1].token === endDelim.token + 1 &&
                   delimiters[i - 1].marker === startDelim.marker;

        ch = String.fromCharCode(startDelim.marker);

        token         = state.tokens[startDelim.token];
        token.type    = isStrong ? 'strong_open' : 'em_open';
        token.tag     = isStrong ? 'strong' : 'em';
        token.nesting = 1;
        token.markup  = isStrong ? ch + ch : ch;
        token.content = '';

        token         = state.tokens[endDelim.token];
        token.type    = isStrong ? 'strong_close' : 'em_close';
        token.tag     = isStrong ? 'strong' : 'em';
        token.nesting = -1;
        token.markup  = isStrong ? ch + ch : ch;
        token.content = '';

        if (isStrong) {
          state.tokens[delimiters[i - 1].token].content = '';
          state.tokens[delimiters[startDelim.end + 1].token].content = '';
          i--;
        }
      }
    }


    // Walk through delimiter list and replace text tokens with tags
    //
    module.exports.postProcess = function emphasis(state) {
      var curr,
          tokens_meta = state.tokens_meta,
          max = state.tokens_meta.length;

      postProcess(state, state.delimiters);

      for (curr = 0; curr < max; curr++) {
        if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
          postProcess(state, tokens_meta[curr].delimiters);
        }
      }
    };

    },{}],41:[function(require,module,exports){

    var entities          = require('../common/entities');
    var has               = require('../common/utils').has;
    var isValidEntityCode = require('../common/utils').isValidEntityCode;
    var fromCodePoint     = require('../common/utils').fromCodePoint;


    var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
    var NAMED_RE   = /^&([a-z][a-z0-9]{1,31});/i;


    module.exports = function entity(state, silent) {
      var ch, code, match, pos = state.pos, max = state.posMax;

      if (state.src.charCodeAt(pos) !== 0x26/* & */) { return false; }

      if (pos + 1 < max) {
        ch = state.src.charCodeAt(pos + 1);

        if (ch === 0x23 /* # */) {
          match = state.src.slice(pos).match(DIGITAL_RE);
          if (match) {
            if (!silent) {
              code = match[1][0].toLowerCase() === 'x' ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);
              state.pending += isValidEntityCode(code) ? fromCodePoint(code) : fromCodePoint(0xFFFD);
            }
            state.pos += match[0].length;
            return true;
          }
        } else {
          match = state.src.slice(pos).match(NAMED_RE);
          if (match) {
            if (has(entities, match[1])) {
              if (!silent) { state.pending += entities[match[1]]; }
              state.pos += match[0].length;
              return true;
            }
          }
        }
      }

      if (!silent) { state.pending += '&'; }
      state.pos++;
      return true;
    };

    },{"../common/entities":1,"../common/utils":4}],42:[function(require,module,exports){

    var isSpace = require('../common/utils').isSpace;

    var ESCAPED = [];

    for (var i = 0; i < 256; i++) { ESCAPED.push(0); }

    '\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'
      .split('').forEach(function (ch) { ESCAPED[ch.charCodeAt(0)] = 1; });


    module.exports = function escape(state, silent) {
      var ch, pos = state.pos, max = state.posMax;

      if (state.src.charCodeAt(pos) !== 0x5C/* \ */) { return false; }

      pos++;

      if (pos < max) {
        ch = state.src.charCodeAt(pos);

        if (ch < 256 && ESCAPED[ch] !== 0) {
          if (!silent) { state.pending += state.src[pos]; }
          state.pos += 2;
          return true;
        }

        if (ch === 0x0A) {
          if (!silent) {
            state.push('hardbreak', 'br', 0);
          }

          pos++;
          // skip leading whitespaces from next line
          while (pos < max) {
            ch = state.src.charCodeAt(pos);
            if (!isSpace(ch)) { break; }
            pos++;
          }

          state.pos = pos;
          return true;
        }
      }

      if (!silent) { state.pending += '\\'; }
      state.pos++;
      return true;
    };

    },{"../common/utils":4}],43:[function(require,module,exports){


    var HTML_TAG_RE = require('../common/html_re').HTML_TAG_RE;


    function isLetter(ch) {
      /*eslint no-bitwise:0*/
      var lc = ch | 0x20; // to lower case
      return (lc >= 0x61/* a */) && (lc <= 0x7a/* z */);
    }


    module.exports = function html_inline(state, silent) {
      var ch, match, max, token,
          pos = state.pos;

      if (!state.md.options.html) { return false; }

      // Check start
      max = state.posMax;
      if (state.src.charCodeAt(pos) !== 0x3C/* < */ ||
          pos + 2 >= max) {
        return false;
      }

      // Quick fail on second char
      ch = state.src.charCodeAt(pos + 1);
      if (ch !== 0x21/* ! */ &&
          ch !== 0x3F/* ? */ &&
          ch !== 0x2F/* / */ &&
          !isLetter(ch)) {
        return false;
      }

      match = state.src.slice(pos).match(HTML_TAG_RE);
      if (!match) { return false; }

      if (!silent) {
        token         = state.push('html_inline', '', 0);
        token.content = state.src.slice(pos, pos + match[0].length);
      }
      state.pos += match[0].length;
      return true;
    };

    },{"../common/html_re":3}],44:[function(require,module,exports){

    var normalizeReference   = require('../common/utils').normalizeReference;
    var isSpace              = require('../common/utils').isSpace;


    module.exports = function image(state, silent) {
      var attrs,
          code,
          content,
          label,
          labelEnd,
          labelStart,
          pos,
          ref,
          res,
          title,
          token,
          tokens,
          start,
          href = '',
          oldPos = state.pos,
          max = state.posMax;

      if (state.src.charCodeAt(state.pos) !== 0x21/* ! */) { return false; }
      if (state.src.charCodeAt(state.pos + 1) !== 0x5B/* [ */) { return false; }

      labelStart = state.pos + 2;
      labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);

      // parser failed to find ']', so it's not a valid link
      if (labelEnd < 0) { return false; }

      pos = labelEnd + 1;
      if (pos < max && state.src.charCodeAt(pos) === 0x28/* ( */) {
        //
        // Inline link
        //

        // [link](  <href>  "title"  )
        //        ^^ skipping these spaces
        pos++;
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (!isSpace(code) && code !== 0x0A) { break; }
        }
        if (pos >= max) { return false; }

        // [link](  <href>  "title"  )
        //          ^^^^^^ parsing link destination
        start = pos;
        res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
        if (res.ok) {
          href = state.md.normalizeLink(res.str);
          if (state.md.validateLink(href)) {
            pos = res.pos;
          } else {
            href = '';
          }
        }

        // [link](  <href>  "title"  )
        //                ^^ skipping these spaces
        start = pos;
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (!isSpace(code) && code !== 0x0A) { break; }
        }

        // [link](  <href>  "title"  )
        //                  ^^^^^^^ parsing link title
        res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
        if (pos < max && start !== pos && res.ok) {
          title = res.str;
          pos = res.pos;

          // [link](  <href>  "title"  )
          //                         ^^ skipping these spaces
          for (; pos < max; pos++) {
            code = state.src.charCodeAt(pos);
            if (!isSpace(code) && code !== 0x0A) { break; }
          }
        } else {
          title = '';
        }

        if (pos >= max || state.src.charCodeAt(pos) !== 0x29/* ) */) {
          state.pos = oldPos;
          return false;
        }
        pos++;
      } else {
        //
        // Link reference
        //
        if (typeof state.env.references === 'undefined') { return false; }

        if (pos < max && state.src.charCodeAt(pos) === 0x5B/* [ */) {
          start = pos + 1;
          pos = state.md.helpers.parseLinkLabel(state, pos);
          if (pos >= 0) {
            label = state.src.slice(start, pos++);
          } else {
            pos = labelEnd + 1;
          }
        } else {
          pos = labelEnd + 1;
        }

        // covers label === '' and label === undefined
        // (collapsed reference link and shortcut reference link respectively)
        if (!label) { label = state.src.slice(labelStart, labelEnd); }

        ref = state.env.references[normalizeReference(label)];
        if (!ref) {
          state.pos = oldPos;
          return false;
        }
        href = ref.href;
        title = ref.title;
      }

      //
      // We found the end of the link, and know for a fact it's a valid link;
      // so all that's left to do is to call tokenizer.
      //
      if (!silent) {
        content = state.src.slice(labelStart, labelEnd);

        state.md.inline.parse(
          content,
          state.md,
          state.env,
          tokens = []
        );

        token          = state.push('image', 'img', 0);
        token.attrs    = attrs = [ [ 'src', href ], [ 'alt', '' ] ];
        token.children = tokens;
        token.content  = content;

        if (title) {
          attrs.push([ 'title', title ]);
        }
      }

      state.pos = pos;
      state.posMax = max;
      return true;
    };

    },{"../common/utils":4}],45:[function(require,module,exports){

    var normalizeReference   = require('../common/utils').normalizeReference;
    var isSpace              = require('../common/utils').isSpace;


    module.exports = function link(state, silent) {
      var attrs,
          code,
          label,
          labelEnd,
          labelStart,
          pos,
          res,
          ref,
          title,
          token,
          href = '',
          oldPos = state.pos,
          max = state.posMax,
          start = state.pos,
          parseReference = true;

      if (state.src.charCodeAt(state.pos) !== 0x5B/* [ */) { return false; }

      labelStart = state.pos + 1;
      labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);

      // parser failed to find ']', so it's not a valid link
      if (labelEnd < 0) { return false; }

      pos = labelEnd + 1;
      if (pos < max && state.src.charCodeAt(pos) === 0x28/* ( */) {
        //
        // Inline link
        //

        // might have found a valid shortcut link, disable reference parsing
        parseReference = false;

        // [link](  <href>  "title"  )
        //        ^^ skipping these spaces
        pos++;
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (!isSpace(code) && code !== 0x0A) { break; }
        }
        if (pos >= max) { return false; }

        // [link](  <href>  "title"  )
        //          ^^^^^^ parsing link destination
        start = pos;
        res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
        if (res.ok) {
          href = state.md.normalizeLink(res.str);
          if (state.md.validateLink(href)) {
            pos = res.pos;
          } else {
            href = '';
          }
        }

        // [link](  <href>  "title"  )
        //                ^^ skipping these spaces
        start = pos;
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (!isSpace(code) && code !== 0x0A) { break; }
        }

        // [link](  <href>  "title"  )
        //                  ^^^^^^^ parsing link title
        res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
        if (pos < max && start !== pos && res.ok) {
          title = res.str;
          pos = res.pos;

          // [link](  <href>  "title"  )
          //                         ^^ skipping these spaces
          for (; pos < max; pos++) {
            code = state.src.charCodeAt(pos);
            if (!isSpace(code) && code !== 0x0A) { break; }
          }
        } else {
          title = '';
        }

        if (pos >= max || state.src.charCodeAt(pos) !== 0x29/* ) */) {
          // parsing a valid shortcut link failed, fallback to reference
          parseReference = true;
        }
        pos++;
      }

      if (parseReference) {
        //
        // Link reference
        //
        if (typeof state.env.references === 'undefined') { return false; }

        if (pos < max && state.src.charCodeAt(pos) === 0x5B/* [ */) {
          start = pos + 1;
          pos = state.md.helpers.parseLinkLabel(state, pos);
          if (pos >= 0) {
            label = state.src.slice(start, pos++);
          } else {
            pos = labelEnd + 1;
          }
        } else {
          pos = labelEnd + 1;
        }

        // covers label === '' and label === undefined
        // (collapsed reference link and shortcut reference link respectively)
        if (!label) { label = state.src.slice(labelStart, labelEnd); }

        ref = state.env.references[normalizeReference(label)];
        if (!ref) {
          state.pos = oldPos;
          return false;
        }
        href = ref.href;
        title = ref.title;
      }

      //
      // We found the end of the link, and know for a fact it's a valid link;
      // so all that's left to do is to call tokenizer.
      //
      if (!silent) {
        state.pos = labelStart;
        state.posMax = labelEnd;

        token        = state.push('link_open', 'a', 1);
        token.attrs  = attrs = [ [ 'href', href ] ];
        if (title) {
          attrs.push([ 'title', title ]);
        }

        state.md.inline.tokenize(state);

        token        = state.push('link_close', 'a', -1);
      }

      state.pos = pos;
      state.posMax = max;
      return true;
    };

    },{"../common/utils":4}],46:[function(require,module,exports){

    var isSpace = require('../common/utils').isSpace;


    module.exports = function newline(state, silent) {
      var pmax, max, pos = state.pos;

      if (state.src.charCodeAt(pos) !== 0x0A/* \n */) { return false; }

      pmax = state.pending.length - 1;
      max = state.posMax;

      // '  \n' -> hardbreak
      // Lookup in pending chars is bad practice! Don't copy to other rules!
      // Pending string is stored in concat mode, indexed lookups will cause
      // convertion to flat mode.
      if (!silent) {
        if (pmax >= 0 && state.pending.charCodeAt(pmax) === 0x20) {
          if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 0x20) {
            state.pending = state.pending.replace(/ +$/, '');
            state.push('hardbreak', 'br', 0);
          } else {
            state.pending = state.pending.slice(0, -1);
            state.push('softbreak', 'br', 0);
          }

        } else {
          state.push('softbreak', 'br', 0);
        }
      }

      pos++;

      // skip heading spaces for next line
      while (pos < max && isSpace(state.src.charCodeAt(pos))) { pos++; }

      state.pos = pos;
      return true;
    };

    },{"../common/utils":4}],47:[function(require,module,exports){


    var Token          = require('../token');
    var isWhiteSpace   = require('../common/utils').isWhiteSpace;
    var isPunctChar    = require('../common/utils').isPunctChar;
    var isMdAsciiPunct = require('../common/utils').isMdAsciiPunct;


    function StateInline(src, md, env, outTokens) {
      this.src = src;
      this.env = env;
      this.md = md;
      this.tokens = outTokens;
      this.tokens_meta = Array(outTokens.length);

      this.pos = 0;
      this.posMax = this.src.length;
      this.level = 0;
      this.pending = '';
      this.pendingLevel = 0;

      // Stores { start: end } pairs. Useful for backtrack
      // optimization of pairs parse (emphasis, strikes).
      this.cache = {};

      // List of emphasis-like delimiters for current tag
      this.delimiters = [];

      // Stack of delimiter lists for upper level tags
      this._prev_delimiters = [];
    }


    // Flush pending text
    //
    StateInline.prototype.pushPending = function () {
      var token = new Token('text', '', 0);
      token.content = this.pending;
      token.level = this.pendingLevel;
      this.tokens.push(token);
      this.pending = '';
      return token;
    };


    // Push new token to "stream".
    // If pending text exists - flush it as text token
    //
    StateInline.prototype.push = function (type, tag, nesting) {
      if (this.pending) {
        this.pushPending();
      }

      var token = new Token(type, tag, nesting);
      var token_meta = null;

      if (nesting < 0) {
        // closing tag
        this.level--;
        this.delimiters = this._prev_delimiters.pop();
      }

      token.level = this.level;

      if (nesting > 0) {
        // opening tag
        this.level++;
        this._prev_delimiters.push(this.delimiters);
        this.delimiters = [];
        token_meta = { delimiters: this.delimiters };
      }

      this.pendingLevel = this.level;
      this.tokens.push(token);
      this.tokens_meta.push(token_meta);
      return token;
    };


    // Scan a sequence of emphasis-like markers, and determine whether
    // it can start an emphasis sequence or end an emphasis sequence.
    //
    //  - start - position to scan from (it should point at a valid marker);
    //  - canSplitWord - determine if these markers can be found inside a word
    //
    StateInline.prototype.scanDelims = function (start, canSplitWord) {
      var pos = start, lastChar, nextChar, count, can_open, can_close,
          isLastWhiteSpace, isLastPunctChar,
          isNextWhiteSpace, isNextPunctChar,
          left_flanking = true,
          right_flanking = true,
          max = this.posMax,
          marker = this.src.charCodeAt(start);

      // treat beginning of the line as a whitespace
      lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20;

      while (pos < max && this.src.charCodeAt(pos) === marker) { pos++; }

      count = pos - start;

      // treat end of the line as a whitespace
      nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20;

      isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
      isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));

      isLastWhiteSpace = isWhiteSpace(lastChar);
      isNextWhiteSpace = isWhiteSpace(nextChar);

      if (isNextWhiteSpace) {
        left_flanking = false;
      } else if (isNextPunctChar) {
        if (!(isLastWhiteSpace || isLastPunctChar)) {
          left_flanking = false;
        }
      }

      if (isLastWhiteSpace) {
        right_flanking = false;
      } else if (isLastPunctChar) {
        if (!(isNextWhiteSpace || isNextPunctChar)) {
          right_flanking = false;
        }
      }

      if (!canSplitWord) {
        can_open  = left_flanking  && (!right_flanking || isLastPunctChar);
        can_close = right_flanking && (!left_flanking  || isNextPunctChar);
      } else {
        can_open  = left_flanking;
        can_close = right_flanking;
      }

      return {
        can_open:  can_open,
        can_close: can_close,
        length:    count
      };
    };


    // re-export Token class to use in block rules
    StateInline.prototype.Token = Token;


    module.exports = StateInline;

    },{"../common/utils":4,"../token":51}],48:[function(require,module,exports){


    // Insert each marker as a separate text token, and add it to delimiter list
    //
    module.exports.tokenize = function strikethrough(state, silent) {
      var i, scanned, token, len, ch,
          start = state.pos,
          marker = state.src.charCodeAt(start);

      if (silent) { return false; }

      if (marker !== 0x7E/* ~ */) { return false; }

      scanned = state.scanDelims(state.pos, true);
      len = scanned.length;
      ch = String.fromCharCode(marker);

      if (len < 2) { return false; }

      if (len % 2) {
        token         = state.push('text', '', 0);
        token.content = ch;
        len--;
      }

      for (i = 0; i < len; i += 2) {
        token         = state.push('text', '', 0);
        token.content = ch + ch;

        state.delimiters.push({
          marker: marker,
          length: 0, // disable "rule of 3" length checks meant for emphasis
          jump:   i,
          token:  state.tokens.length - 1,
          end:    -1,
          open:   scanned.can_open,
          close:  scanned.can_close
        });
      }

      state.pos += scanned.length;

      return true;
    };


    function postProcess(state, delimiters) {
      var i, j,
          startDelim,
          endDelim,
          token,
          loneMarkers = [],
          max = delimiters.length;

      for (i = 0; i < max; i++) {
        startDelim = delimiters[i];

        if (startDelim.marker !== 0x7E/* ~ */) {
          continue;
        }

        if (startDelim.end === -1) {
          continue;
        }

        endDelim = delimiters[startDelim.end];

        token         = state.tokens[startDelim.token];
        token.type    = 's_open';
        token.tag     = 's';
        token.nesting = 1;
        token.markup  = '~~';
        token.content = '';

        token         = state.tokens[endDelim.token];
        token.type    = 's_close';
        token.tag     = 's';
        token.nesting = -1;
        token.markup  = '~~';
        token.content = '';

        if (state.tokens[endDelim.token - 1].type === 'text' &&
            state.tokens[endDelim.token - 1].content === '~') {

          loneMarkers.push(endDelim.token - 1);
        }
      }

      // If a marker sequence has an odd number of characters, it's splitted
      // like this: `~~~~~` -> `~` + `~~` + `~~`, leaving one marker at the
      // start of the sequence.
      //
      // So, we have to move all those markers after subsequent s_close tags.
      //
      while (loneMarkers.length) {
        i = loneMarkers.pop();
        j = i + 1;

        while (j < state.tokens.length && state.tokens[j].type === 's_close') {
          j++;
        }

        j--;

        if (i !== j) {
          token = state.tokens[j];
          state.tokens[j] = state.tokens[i];
          state.tokens[i] = token;
        }
      }
    }


    // Walk through delimiter list and replace text tokens with tags
    //
    module.exports.postProcess = function strikethrough(state) {
      var curr,
          tokens_meta = state.tokens_meta,
          max = state.tokens_meta.length;

      postProcess(state, state.delimiters);

      for (curr = 0; curr < max; curr++) {
        if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
          postProcess(state, tokens_meta[curr].delimiters);
        }
      }
    };

    },{}],49:[function(require,module,exports){


    // Rule to skip pure text
    // '{}$%@~+=:' reserved for extentions

    // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~

    // !!!! Don't confuse with "Markdown ASCII Punctuation" chars
    // http://spec.commonmark.org/0.15/#ascii-punctuation-character
    function isTerminatorChar(ch) {
      switch (ch) {
        case 0x0A/* \n */:
        case 0x21/* ! */:
        case 0x23/* # */:
        case 0x24/* $ */:
        case 0x25/* % */:
        case 0x26/* & */:
        case 0x2A/* * */:
        case 0x2B/* + */:
        case 0x2D/* - */:
        case 0x3A/* : */:
        case 0x3C/* < */:
        case 0x3D/* = */:
        case 0x3E/* > */:
        case 0x40/* @ */:
        case 0x5B/* [ */:
        case 0x5C/* \ */:
        case 0x5D/* ] */:
        case 0x5E/* ^ */:
        case 0x5F/* _ */:
        case 0x60/* ` */:
        case 0x7B/* { */:
        case 0x7D/* } */:
        case 0x7E/* ~ */:
          return true;
        default:
          return false;
      }
    }

    module.exports = function text(state, silent) {
      var pos = state.pos;

      while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
        pos++;
      }

      if (pos === state.pos) { return false; }

      if (!silent) { state.pending += state.src.slice(state.pos, pos); }

      state.pos = pos;

      return true;
    };

    // Alternative implementation, for memory.
    //
    // It costs 10% of performance, but allows extend terminators list, if place it
    // to `ParcerInline` property. Probably, will switch to it sometime, such
    // flexibility required.

    /*
    var TERMINATOR_RE = /[\n!#$%&*+\-:<=>@[\\\]^_`{}~]/;

    module.exports = function text(state, silent) {
      var pos = state.pos,
          idx = state.src.slice(pos).search(TERMINATOR_RE);

      // first char is terminator -> empty text
      if (idx === 0) { return false; }

      // no terminator -> text till end of string
      if (idx < 0) {
        if (!silent) { state.pending += state.src.slice(pos); }
        state.pos = state.src.length;
        return true;
      }

      if (!silent) { state.pending += state.src.slice(pos, pos + idx); }

      state.pos += idx;

      return true;
    };*/

    },{}],50:[function(require,module,exports){


    module.exports = function text_collapse(state) {
      var curr, last,
          level = 0,
          tokens = state.tokens,
          max = state.tokens.length;

      for (curr = last = 0; curr < max; curr++) {
        // re-calculate levels after emphasis/strikethrough turns some text nodes
        // into opening/closing tags
        if (tokens[curr].nesting < 0) level--; // closing tag
        tokens[curr].level = level;
        if (tokens[curr].nesting > 0) level++; // opening tag

        if (tokens[curr].type === 'text' &&
            curr + 1 < max &&
            tokens[curr + 1].type === 'text') {

          // collapse two adjacent text nodes
          tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
        } else {
          if (curr !== last) { tokens[last] = tokens[curr]; }

          last++;
        }
      }

      if (curr !== last) {
        tokens.length = last;
      }
    };

    },{}],51:[function(require,module,exports){


    /**
     * class Token
     **/

    /**
     * new Token(type, tag, nesting)
     *
     * Create new token and fill passed properties.
     **/
    function Token(type, tag, nesting) {
      /**
       * Token#type -> String
       *
       * Type of the token (string, e.g. "paragraph_open")
       **/
      this.type     = type;

      /**
       * Token#tag -> String
       *
       * html tag name, e.g. "p"
       **/
      this.tag      = tag;

      /**
       * Token#attrs -> Array
       *
       * Html attributes. Format: `[ [ name1, value1 ], [ name2, value2 ] ]`
       **/
      this.attrs    = null;

      /**
       * Token#map -> Array
       *
       * Source map info. Format: `[ line_begin, line_end ]`
       **/
      this.map      = null;

      /**
       * Token#nesting -> Number
       *
       * Level change (number in {-1, 0, 1} set), where:
       *
       * -  `1` means the tag is opening
       * -  `0` means the tag is self-closing
       * - `-1` means the tag is closing
       **/
      this.nesting  = nesting;

      /**
       * Token#level -> Number
       *
       * nesting level, the same as `state.level`
       **/
      this.level    = 0;

      /**
       * Token#children -> Array
       *
       * An array of child nodes (inline and img tokens)
       **/
      this.children = null;

      /**
       * Token#content -> String
       *
       * In a case of self-closing tag (code, html, fence, etc.),
       * it has contents of this tag.
       **/
      this.content  = '';

      /**
       * Token#markup -> String
       *
       * '*' or '_' for emphasis, fence string for fence, etc.
       **/
      this.markup   = '';

      /**
       * Token#info -> String
       *
       * fence infostring
       **/
      this.info     = '';

      /**
       * Token#meta -> Object
       *
       * A place for plugins to store an arbitrary data
       **/
      this.meta     = null;

      /**
       * Token#block -> Boolean
       *
       * True for block-level tokens, false for inline tokens.
       * Used in renderer to calculate line breaks
       **/
      this.block    = false;

      /**
       * Token#hidden -> Boolean
       *
       * If it's true, ignore this element when rendering. Used for tight lists
       * to hide paragraphs.
       **/
      this.hidden   = false;
    }


    /**
     * Token.attrIndex(name) -> Number
     *
     * Search attribute index by name.
     **/
    Token.prototype.attrIndex = function attrIndex(name) {
      var attrs, i, len;

      if (!this.attrs) { return -1; }

      attrs = this.attrs;

      for (i = 0, len = attrs.length; i < len; i++) {
        if (attrs[i][0] === name) { return i; }
      }
      return -1;
    };


    /**
     * Token.attrPush(attrData)
     *
     * Add `[ name, value ]` attribute to list. Init attrs if necessary
     **/
    Token.prototype.attrPush = function attrPush(attrData) {
      if (this.attrs) {
        this.attrs.push(attrData);
      } else {
        this.attrs = [ attrData ];
      }
    };


    /**
     * Token.attrSet(name, value)
     *
     * Set `name` attribute to `value`. Override old value if exists.
     **/
    Token.prototype.attrSet = function attrSet(name, value) {
      var idx = this.attrIndex(name),
          attrData = [ name, value ];

      if (idx < 0) {
        this.attrPush(attrData);
      } else {
        this.attrs[idx] = attrData;
      }
    };


    /**
     * Token.attrGet(name)
     *
     * Get the value of attribute `name`, or null if it does not exist.
     **/
    Token.prototype.attrGet = function attrGet(name) {
      var idx = this.attrIndex(name), value = null;
      if (idx >= 0) {
        value = this.attrs[idx][1];
      }
      return value;
    };


    /**
     * Token.attrJoin(name, value)
     *
     * Join value to existing attribute via space. Or create new attribute if not
     * exists. Useful to operate with token classes.
     **/
    Token.prototype.attrJoin = function attrJoin(name, value) {
      var idx = this.attrIndex(name);

      if (idx < 0) {
        this.attrPush([ name, value ]);
      } else {
        this.attrs[idx][1] = this.attrs[idx][1] + ' ' + value;
      }
    };


    module.exports = Token;

    },{}],52:[function(require,module,exports){
    module.exports={ "Aacute": "\u00C1", "aacute": "\u00E1", "Abreve": "\u0102", "abreve": "\u0103", "ac": "\u223E", "acd": "\u223F", "acE": "\u223E\u0333", "Acirc": "\u00C2", "acirc": "\u00E2", "acute": "\u00B4", "Acy": "\u0410", "acy": "\u0430", "AElig": "\u00C6", "aelig": "\u00E6", "af": "\u2061", "Afr": "\uD835\uDD04", "afr": "\uD835\uDD1E", "Agrave": "\u00C0", "agrave": "\u00E0", "alefsym": "\u2135", "aleph": "\u2135", "Alpha": "\u0391", "alpha": "\u03B1", "Amacr": "\u0100", "amacr": "\u0101", "amalg": "\u2A3F", "amp": "&", "AMP": "&", "andand": "\u2A55", "And": "\u2A53", "and": "\u2227", "andd": "\u2A5C", "andslope": "\u2A58", "andv": "\u2A5A", "ang": "\u2220", "ange": "\u29A4", "angle": "\u2220", "angmsdaa": "\u29A8", "angmsdab": "\u29A9", "angmsdac": "\u29AA", "angmsdad": "\u29AB", "angmsdae": "\u29AC", "angmsdaf": "\u29AD", "angmsdag": "\u29AE", "angmsdah": "\u29AF", "angmsd": "\u2221", "angrt": "\u221F", "angrtvb": "\u22BE", "angrtvbd": "\u299D", "angsph": "\u2222", "angst": "\u00C5", "angzarr": "\u237C", "Aogon": "\u0104", "aogon": "\u0105", "Aopf": "\uD835\uDD38", "aopf": "\uD835\uDD52", "apacir": "\u2A6F", "ap": "\u2248", "apE": "\u2A70", "ape": "\u224A", "apid": "\u224B", "apos": "'", "ApplyFunction": "\u2061", "approx": "\u2248", "approxeq": "\u224A", "Aring": "\u00C5", "aring": "\u00E5", "Ascr": "\uD835\uDC9C", "ascr": "\uD835\uDCB6", "Assign": "\u2254", "ast": "*", "asymp": "\u2248", "asympeq": "\u224D", "Atilde": "\u00C3", "atilde": "\u00E3", "Auml": "\u00C4", "auml": "\u00E4", "awconint": "\u2233", "awint": "\u2A11", "backcong": "\u224C", "backepsilon": "\u03F6", "backprime": "\u2035", "backsim": "\u223D", "backsimeq": "\u22CD", "Backslash": "\u2216", "Barv": "\u2AE7", "barvee": "\u22BD", "barwed": "\u2305", "Barwed": "\u2306", "barwedge": "\u2305", "bbrk": "\u23B5", "bbrktbrk": "\u23B6", "bcong": "\u224C", "Bcy": "\u0411", "bcy": "\u0431", "bdquo": "\u201E", "becaus": "\u2235", "because": "\u2235", "Because": "\u2235", "bemptyv": "\u29B0", "bepsi": "\u03F6", "bernou": "\u212C", "Bernoullis": "\u212C", "Beta": "\u0392", "beta": "\u03B2", "beth": "\u2136", "between": "\u226C", "Bfr": "\uD835\uDD05", "bfr": "\uD835\uDD1F", "bigcap": "\u22C2", "bigcirc": "\u25EF", "bigcup": "\u22C3", "bigodot": "\u2A00", "bigoplus": "\u2A01", "bigotimes": "\u2A02", "bigsqcup": "\u2A06", "bigstar": "\u2605", "bigtriangledown": "\u25BD", "bigtriangleup": "\u25B3", "biguplus": "\u2A04", "bigvee": "\u22C1", "bigwedge": "\u22C0", "bkarow": "\u290D", "blacklozenge": "\u29EB", "blacksquare": "\u25AA", "blacktriangle": "\u25B4", "blacktriangledown": "\u25BE", "blacktriangleleft": "\u25C2", "blacktriangleright": "\u25B8", "blank": "\u2423", "blk12": "\u2592", "blk14": "\u2591", "blk34": "\u2593", "block": "\u2588", "bne": "=\u20E5", "bnequiv": "\u2261\u20E5", "bNot": "\u2AED", "bnot": "\u2310", "Bopf": "\uD835\uDD39", "bopf": "\uD835\uDD53", "bot": "\u22A5", "bottom": "\u22A5", "bowtie": "\u22C8", "boxbox": "\u29C9", "boxdl": "\u2510", "boxdL": "\u2555", "boxDl": "\u2556", "boxDL": "\u2557", "boxdr": "\u250C", "boxdR": "\u2552", "boxDr": "\u2553", "boxDR": "\u2554", "boxh": "\u2500", "boxH": "\u2550", "boxhd": "\u252C", "boxHd": "\u2564", "boxhD": "\u2565", "boxHD": "\u2566", "boxhu": "\u2534", "boxHu": "\u2567", "boxhU": "\u2568", "boxHU": "\u2569", "boxminus": "\u229F", "boxplus": "\u229E", "boxtimes": "\u22A0", "boxul": "\u2518", "boxuL": "\u255B", "boxUl": "\u255C", "boxUL": "\u255D", "boxur": "\u2514", "boxuR": "\u2558", "boxUr": "\u2559", "boxUR": "\u255A", "boxv": "\u2502", "boxV": "\u2551", "boxvh": "\u253C", "boxvH": "\u256A", "boxVh": "\u256B", "boxVH": "\u256C", "boxvl": "\u2524", "boxvL": "\u2561", "boxVl": "\u2562", "boxVL": "\u2563", "boxvr": "\u251C", "boxvR": "\u255E", "boxVr": "\u255F", "boxVR": "\u2560", "bprime": "\u2035", "breve": "\u02D8", "Breve": "\u02D8", "brvbar": "\u00A6", "bscr": "\uD835\uDCB7", "Bscr": "\u212C", "bsemi": "\u204F", "bsim": "\u223D", "bsime": "\u22CD", "bsolb": "\u29C5", "bsol": "\\", "bsolhsub": "\u27C8", "bull": "\u2022", "bullet": "\u2022", "bump": "\u224E", "bumpE": "\u2AAE", "bumpe": "\u224F", "Bumpeq": "\u224E", "bumpeq": "\u224F", "Cacute": "\u0106", "cacute": "\u0107", "capand": "\u2A44", "capbrcup": "\u2A49", "capcap": "\u2A4B", "cap": "\u2229", "Cap": "\u22D2", "capcup": "\u2A47", "capdot": "\u2A40", "CapitalDifferentialD": "\u2145", "caps": "\u2229\uFE00", "caret": "\u2041", "caron": "\u02C7", "Cayleys": "\u212D", "ccaps": "\u2A4D", "Ccaron": "\u010C", "ccaron": "\u010D", "Ccedil": "\u00C7", "ccedil": "\u00E7", "Ccirc": "\u0108", "ccirc": "\u0109", "Cconint": "\u2230", "ccups": "\u2A4C", "ccupssm": "\u2A50", "Cdot": "\u010A", "cdot": "\u010B", "cedil": "\u00B8", "Cedilla": "\u00B8", "cemptyv": "\u29B2", "cent": "\u00A2", "centerdot": "\u00B7", "CenterDot": "\u00B7", "cfr": "\uD835\uDD20", "Cfr": "\u212D", "CHcy": "\u0427", "chcy": "\u0447", "check": "\u2713", "checkmark": "\u2713", "Chi": "\u03A7", "chi": "\u03C7", "circ": "\u02C6", "circeq": "\u2257", "circlearrowleft": "\u21BA", "circlearrowright": "\u21BB", "circledast": "\u229B", "circledcirc": "\u229A", "circleddash": "\u229D", "CircleDot": "\u2299", "circledR": "\u00AE", "circledS": "\u24C8", "CircleMinus": "\u2296", "CirclePlus": "\u2295", "CircleTimes": "\u2297", "cir": "\u25CB", "cirE": "\u29C3", "cire": "\u2257", "cirfnint": "\u2A10", "cirmid": "\u2AEF", "cirscir": "\u29C2", "ClockwiseContourIntegral": "\u2232", "CloseCurlyDoubleQuote": "\u201D", "CloseCurlyQuote": "\u2019", "clubs": "\u2663", "clubsuit": "\u2663", "colon": ":", "Colon": "\u2237", "Colone": "\u2A74", "colone": "\u2254", "coloneq": "\u2254", "comma": ",", "commat": "@", "comp": "\u2201", "compfn": "\u2218", "complement": "\u2201", "complexes": "\u2102", "cong": "\u2245", "congdot": "\u2A6D", "Congruent": "\u2261", "conint": "\u222E", "Conint": "\u222F", "ContourIntegral": "\u222E", "copf": "\uD835\uDD54", "Copf": "\u2102", "coprod": "\u2210", "Coproduct": "\u2210", "copy": "\u00A9", "COPY": "\u00A9", "copysr": "\u2117", "CounterClockwiseContourIntegral": "\u2233", "crarr": "\u21B5", "cross": "\u2717", "Cross": "\u2A2F", "Cscr": "\uD835\uDC9E", "cscr": "\uD835\uDCB8", "csub": "\u2ACF", "csube": "\u2AD1", "csup": "\u2AD0", "csupe": "\u2AD2", "ctdot": "\u22EF", "cudarrl": "\u2938", "cudarrr": "\u2935", "cuepr": "\u22DE", "cuesc": "\u22DF", "cularr": "\u21B6", "cularrp": "\u293D", "cupbrcap": "\u2A48", "cupcap": "\u2A46", "CupCap": "\u224D", "cup": "\u222A", "Cup": "\u22D3", "cupcup": "\u2A4A", "cupdot": "\u228D", "cupor": "\u2A45", "cups": "\u222A\uFE00", "curarr": "\u21B7", "curarrm": "\u293C", "curlyeqprec": "\u22DE", "curlyeqsucc": "\u22DF", "curlyvee": "\u22CE", "curlywedge": "\u22CF", "curren": "\u00A4", "curvearrowleft": "\u21B6", "curvearrowright": "\u21B7", "cuvee": "\u22CE", "cuwed": "\u22CF", "cwconint": "\u2232", "cwint": "\u2231", "cylcty": "\u232D", "dagger": "\u2020", "Dagger": "\u2021", "daleth": "\u2138", "darr": "\u2193", "Darr": "\u21A1", "dArr": "\u21D3", "dash": "\u2010", "Dashv": "\u2AE4", "dashv": "\u22A3", "dbkarow": "\u290F", "dblac": "\u02DD", "Dcaron": "\u010E", "dcaron": "\u010F", "Dcy": "\u0414", "dcy": "\u0434", "ddagger": "\u2021", "ddarr": "\u21CA", "DD": "\u2145", "dd": "\u2146", "DDotrahd": "\u2911", "ddotseq": "\u2A77", "deg": "\u00B0", "Del": "\u2207", "Delta": "\u0394", "delta": "\u03B4", "demptyv": "\u29B1", "dfisht": "\u297F", "Dfr": "\uD835\uDD07", "dfr": "\uD835\uDD21", "dHar": "\u2965", "dharl": "\u21C3", "dharr": "\u21C2", "DiacriticalAcute": "\u00B4", "DiacriticalDot": "\u02D9", "DiacriticalDoubleAcute": "\u02DD", "DiacriticalGrave": "`", "DiacriticalTilde": "\u02DC", "diam": "\u22C4", "diamond": "\u22C4", "Diamond": "\u22C4", "diamondsuit": "\u2666", "diams": "\u2666", "die": "\u00A8", "DifferentialD": "\u2146", "digamma": "\u03DD", "disin": "\u22F2", "div": "\u00F7", "divide": "\u00F7", "divideontimes": "\u22C7", "divonx": "\u22C7", "DJcy": "\u0402", "djcy": "\u0452", "dlcorn": "\u231E", "dlcrop": "\u230D", "dollar": "$", "Dopf": "\uD835\uDD3B", "dopf": "\uD835\uDD55", "Dot": "\u00A8", "dot": "\u02D9", "DotDot": "\u20DC", "doteq": "\u2250", "doteqdot": "\u2251", "DotEqual": "\u2250", "dotminus": "\u2238", "dotplus": "\u2214", "dotsquare": "\u22A1", "doublebarwedge": "\u2306", "DoubleContourIntegral": "\u222F", "DoubleDot": "\u00A8", "DoubleDownArrow": "\u21D3", "DoubleLeftArrow": "\u21D0", "DoubleLeftRightArrow": "\u21D4", "DoubleLeftTee": "\u2AE4", "DoubleLongLeftArrow": "\u27F8", "DoubleLongLeftRightArrow": "\u27FA", "DoubleLongRightArrow": "\u27F9", "DoubleRightArrow": "\u21D2", "DoubleRightTee": "\u22A8", "DoubleUpArrow": "\u21D1", "DoubleUpDownArrow": "\u21D5", "DoubleVerticalBar": "\u2225", "DownArrowBar": "\u2913", "downarrow": "\u2193", "DownArrow": "\u2193", "Downarrow": "\u21D3", "DownArrowUpArrow": "\u21F5", "DownBreve": "\u0311", "downdownarrows": "\u21CA", "downharpoonleft": "\u21C3", "downharpoonright": "\u21C2", "DownLeftRightVector": "\u2950", "DownLeftTeeVector": "\u295E", "DownLeftVectorBar": "\u2956", "DownLeftVector": "\u21BD", "DownRightTeeVector": "\u295F", "DownRightVectorBar": "\u2957", "DownRightVector": "\u21C1", "DownTeeArrow": "\u21A7", "DownTee": "\u22A4", "drbkarow": "\u2910", "drcorn": "\u231F", "drcrop": "\u230C", "Dscr": "\uD835\uDC9F", "dscr": "\uD835\uDCB9", "DScy": "\u0405", "dscy": "\u0455", "dsol": "\u29F6", "Dstrok": "\u0110", "dstrok": "\u0111", "dtdot": "\u22F1", "dtri": "\u25BF", "dtrif": "\u25BE", "duarr": "\u21F5", "duhar": "\u296F", "dwangle": "\u29A6", "DZcy": "\u040F", "dzcy": "\u045F", "dzigrarr": "\u27FF", "Eacute": "\u00C9", "eacute": "\u00E9", "easter": "\u2A6E", "Ecaron": "\u011A", "ecaron": "\u011B", "Ecirc": "\u00CA", "ecirc": "\u00EA", "ecir": "\u2256", "ecolon": "\u2255", "Ecy": "\u042D", "ecy": "\u044D", "eDDot": "\u2A77", "Edot": "\u0116", "edot": "\u0117", "eDot": "\u2251", "ee": "\u2147", "efDot": "\u2252", "Efr": "\uD835\uDD08", "efr": "\uD835\uDD22", "eg": "\u2A9A", "Egrave": "\u00C8", "egrave": "\u00E8", "egs": "\u2A96", "egsdot": "\u2A98", "el": "\u2A99", "Element": "\u2208", "elinters": "\u23E7", "ell": "\u2113", "els": "\u2A95", "elsdot": "\u2A97", "Emacr": "\u0112", "emacr": "\u0113", "empty": "\u2205", "emptyset": "\u2205", "EmptySmallSquare": "\u25FB", "emptyv": "\u2205", "EmptyVerySmallSquare": "\u25AB", "emsp13": "\u2004", "emsp14": "\u2005", "emsp": "\u2003", "ENG": "\u014A", "eng": "\u014B", "ensp": "\u2002", "Eogon": "\u0118", "eogon": "\u0119", "Eopf": "\uD835\uDD3C", "eopf": "\uD835\uDD56", "epar": "\u22D5", "eparsl": "\u29E3", "eplus": "\u2A71", "epsi": "\u03B5", "Epsilon": "\u0395", "epsilon": "\u03B5", "epsiv": "\u03F5", "eqcirc": "\u2256", "eqcolon": "\u2255", "eqsim": "\u2242", "eqslantgtr": "\u2A96", "eqslantless": "\u2A95", "Equal": "\u2A75", "equals": "=", "EqualTilde": "\u2242", "equest": "\u225F", "Equilibrium": "\u21CC", "equiv": "\u2261", "equivDD": "\u2A78", "eqvparsl": "\u29E5", "erarr": "\u2971", "erDot": "\u2253", "escr": "\u212F", "Escr": "\u2130", "esdot": "\u2250", "Esim": "\u2A73", "esim": "\u2242", "Eta": "\u0397", "eta": "\u03B7", "ETH": "\u00D0", "eth": "\u00F0", "Euml": "\u00CB", "euml": "\u00EB", "euro": "\u20AC", "excl": "!", "exist": "\u2203", "Exists": "\u2203", "expectation": "\u2130", "exponentiale": "\u2147", "ExponentialE": "\u2147", "fallingdotseq": "\u2252", "Fcy": "\u0424", "fcy": "\u0444", "female": "\u2640", "ffilig": "\uFB03", "fflig": "\uFB00", "ffllig": "\uFB04", "Ffr": "\uD835\uDD09", "ffr": "\uD835\uDD23", "filig": "\uFB01", "FilledSmallSquare": "\u25FC", "FilledVerySmallSquare": "\u25AA", "fjlig": "fj", "flat": "\u266D", "fllig": "\uFB02", "fltns": "\u25B1", "fnof": "\u0192", "Fopf": "\uD835\uDD3D", "fopf": "\uD835\uDD57", "forall": "\u2200", "ForAll": "\u2200", "fork": "\u22D4", "forkv": "\u2AD9", "Fouriertrf": "\u2131", "fpartint": "\u2A0D", "frac12": "\u00BD", "frac13": "\u2153", "frac14": "\u00BC", "frac15": "\u2155", "frac16": "\u2159", "frac18": "\u215B", "frac23": "\u2154", "frac25": "\u2156", "frac34": "\u00BE", "frac35": "\u2157", "frac38": "\u215C", "frac45": "\u2158", "frac56": "\u215A", "frac58": "\u215D", "frac78": "\u215E", "frasl": "\u2044", "frown": "\u2322", "fscr": "\uD835\uDCBB", "Fscr": "\u2131", "gacute": "\u01F5", "Gamma": "\u0393", "gamma": "\u03B3", "Gammad": "\u03DC", "gammad": "\u03DD", "gap": "\u2A86", "Gbreve": "\u011E", "gbreve": "\u011F", "Gcedil": "\u0122", "Gcirc": "\u011C", "gcirc": "\u011D", "Gcy": "\u0413", "gcy": "\u0433", "Gdot": "\u0120", "gdot": "\u0121", "ge": "\u2265", "gE": "\u2267", "gEl": "\u2A8C", "gel": "\u22DB", "geq": "\u2265", "geqq": "\u2267", "geqslant": "\u2A7E", "gescc": "\u2AA9", "ges": "\u2A7E", "gesdot": "\u2A80", "gesdoto": "\u2A82", "gesdotol": "\u2A84", "gesl": "\u22DB\uFE00", "gesles": "\u2A94", "Gfr": "\uD835\uDD0A", "gfr": "\uD835\uDD24", "gg": "\u226B", "Gg": "\u22D9", "ggg": "\u22D9", "gimel": "\u2137", "GJcy": "\u0403", "gjcy": "\u0453", "gla": "\u2AA5", "gl": "\u2277", "glE": "\u2A92", "glj": "\u2AA4", "gnap": "\u2A8A", "gnapprox": "\u2A8A", "gne": "\u2A88", "gnE": "\u2269", "gneq": "\u2A88", "gneqq": "\u2269", "gnsim": "\u22E7", "Gopf": "\uD835\uDD3E", "gopf": "\uD835\uDD58", "grave": "`", "GreaterEqual": "\u2265", "GreaterEqualLess": "\u22DB", "GreaterFullEqual": "\u2267", "GreaterGreater": "\u2AA2", "GreaterLess": "\u2277", "GreaterSlantEqual": "\u2A7E", "GreaterTilde": "\u2273", "Gscr": "\uD835\uDCA2", "gscr": "\u210A", "gsim": "\u2273", "gsime": "\u2A8E", "gsiml": "\u2A90", "gtcc": "\u2AA7", "gtcir": "\u2A7A", "gt": ">", "GT": ">", "Gt": "\u226B", "gtdot": "\u22D7", "gtlPar": "\u2995", "gtquest": "\u2A7C", "gtrapprox": "\u2A86", "gtrarr": "\u2978", "gtrdot": "\u22D7", "gtreqless": "\u22DB", "gtreqqless": "\u2A8C", "gtrless": "\u2277", "gtrsim": "\u2273", "gvertneqq": "\u2269\uFE00", "gvnE": "\u2269\uFE00", "Hacek": "\u02C7", "hairsp": "\u200A", "half": "\u00BD", "hamilt": "\u210B", "HARDcy": "\u042A", "hardcy": "\u044A", "harrcir": "\u2948", "harr": "\u2194", "hArr": "\u21D4", "harrw": "\u21AD", "Hat": "^", "hbar": "\u210F", "Hcirc": "\u0124", "hcirc": "\u0125", "hearts": "\u2665", "heartsuit": "\u2665", "hellip": "\u2026", "hercon": "\u22B9", "hfr": "\uD835\uDD25", "Hfr": "\u210C", "HilbertSpace": "\u210B", "hksearow": "\u2925", "hkswarow": "\u2926", "hoarr": "\u21FF", "homtht": "\u223B", "hookleftarrow": "\u21A9", "hookrightarrow": "\u21AA", "hopf": "\uD835\uDD59", "Hopf": "\u210D", "horbar": "\u2015", "HorizontalLine": "\u2500", "hscr": "\uD835\uDCBD", "Hscr": "\u210B", "hslash": "\u210F", "Hstrok": "\u0126", "hstrok": "\u0127", "HumpDownHump": "\u224E", "HumpEqual": "\u224F", "hybull": "\u2043", "hyphen": "\u2010", "Iacute": "\u00CD", "iacute": "\u00ED", "ic": "\u2063", "Icirc": "\u00CE", "icirc": "\u00EE", "Icy": "\u0418", "icy": "\u0438", "Idot": "\u0130", "IEcy": "\u0415", "iecy": "\u0435", "iexcl": "\u00A1", "iff": "\u21D4", "ifr": "\uD835\uDD26", "Ifr": "\u2111", "Igrave": "\u00CC", "igrave": "\u00EC", "ii": "\u2148", "iiiint": "\u2A0C", "iiint": "\u222D", "iinfin": "\u29DC", "iiota": "\u2129", "IJlig": "\u0132", "ijlig": "\u0133", "Imacr": "\u012A", "imacr": "\u012B", "image": "\u2111", "ImaginaryI": "\u2148", "imagline": "\u2110", "imagpart": "\u2111", "imath": "\u0131", "Im": "\u2111", "imof": "\u22B7", "imped": "\u01B5", "Implies": "\u21D2", "incare": "\u2105", "in": "\u2208", "infin": "\u221E", "infintie": "\u29DD", "inodot": "\u0131", "intcal": "\u22BA", "int": "\u222B", "Int": "\u222C", "integers": "\u2124", "Integral": "\u222B", "intercal": "\u22BA", "Intersection": "\u22C2", "intlarhk": "\u2A17", "intprod": "\u2A3C", "InvisibleComma": "\u2063", "InvisibleTimes": "\u2062", "IOcy": "\u0401", "iocy": "\u0451", "Iogon": "\u012E", "iogon": "\u012F", "Iopf": "\uD835\uDD40", "iopf": "\uD835\uDD5A", "Iota": "\u0399", "iota": "\u03B9", "iprod": "\u2A3C", "iquest": "\u00BF", "iscr": "\uD835\uDCBE", "Iscr": "\u2110", "isin": "\u2208", "isindot": "\u22F5", "isinE": "\u22F9", "isins": "\u22F4", "isinsv": "\u22F3", "isinv": "\u2208", "it": "\u2062", "Itilde": "\u0128", "itilde": "\u0129", "Iukcy": "\u0406", "iukcy": "\u0456", "Iuml": "\u00CF", "iuml": "\u00EF", "Jcirc": "\u0134", "jcirc": "\u0135", "Jcy": "\u0419", "jcy": "\u0439", "Jfr": "\uD835\uDD0D", "jfr": "\uD835\uDD27", "jmath": "\u0237", "Jopf": "\uD835\uDD41", "jopf": "\uD835\uDD5B", "Jscr": "\uD835\uDCA5", "jscr": "\uD835\uDCBF", "Jsercy": "\u0408", "jsercy": "\u0458", "Jukcy": "\u0404", "jukcy": "\u0454", "Kappa": "\u039A", "kappa": "\u03BA", "kappav": "\u03F0", "Kcedil": "\u0136", "kcedil": "\u0137", "Kcy": "\u041A", "kcy": "\u043A", "Kfr": "\uD835\uDD0E", "kfr": "\uD835\uDD28", "kgreen": "\u0138", "KHcy": "\u0425", "khcy": "\u0445", "KJcy": "\u040C", "kjcy": "\u045C", "Kopf": "\uD835\uDD42", "kopf": "\uD835\uDD5C", "Kscr": "\uD835\uDCA6", "kscr": "\uD835\uDCC0", "lAarr": "\u21DA", "Lacute": "\u0139", "lacute": "\u013A", "laemptyv": "\u29B4", "lagran": "\u2112", "Lambda": "\u039B", "lambda": "\u03BB", "lang": "\u27E8", "Lang": "\u27EA", "langd": "\u2991", "langle": "\u27E8", "lap": "\u2A85", "Laplacetrf": "\u2112", "laquo": "\u00AB", "larrb": "\u21E4", "larrbfs": "\u291F", "larr": "\u2190", "Larr": "\u219E", "lArr": "\u21D0", "larrfs": "\u291D", "larrhk": "\u21A9", "larrlp": "\u21AB", "larrpl": "\u2939", "larrsim": "\u2973", "larrtl": "\u21A2", "latail": "\u2919", "lAtail": "\u291B", "lat": "\u2AAB", "late": "\u2AAD", "lates": "\u2AAD\uFE00", "lbarr": "\u290C", "lBarr": "\u290E", "lbbrk": "\u2772", "lbrace": "{", "lbrack": "[", "lbrke": "\u298B", "lbrksld": "\u298F", "lbrkslu": "\u298D", "Lcaron": "\u013D", "lcaron": "\u013E", "Lcedil": "\u013B", "lcedil": "\u013C", "lceil": "\u2308", "lcub": "{", "Lcy": "\u041B", "lcy": "\u043B", "ldca": "\u2936", "ldquo": "\u201C", "ldquor": "\u201E", "ldrdhar": "\u2967", "ldrushar": "\u294B", "ldsh": "\u21B2", "le": "\u2264", "lE": "\u2266", "LeftAngleBracket": "\u27E8", "LeftArrowBar": "\u21E4", "leftarrow": "\u2190", "LeftArrow": "\u2190", "Leftarrow": "\u21D0", "LeftArrowRightArrow": "\u21C6", "leftarrowtail": "\u21A2", "LeftCeiling": "\u2308", "LeftDoubleBracket": "\u27E6", "LeftDownTeeVector": "\u2961", "LeftDownVectorBar": "\u2959", "LeftDownVector": "\u21C3", "LeftFloor": "\u230A", "leftharpoondown": "\u21BD", "leftharpoonup": "\u21BC", "leftleftarrows": "\u21C7", "leftrightarrow": "\u2194", "LeftRightArrow": "\u2194", "Leftrightarrow": "\u21D4", "leftrightarrows": "\u21C6", "leftrightharpoons": "\u21CB", "leftrightsquigarrow": "\u21AD", "LeftRightVector": "\u294E", "LeftTeeArrow": "\u21A4", "LeftTee": "\u22A3", "LeftTeeVector": "\u295A", "leftthreetimes": "\u22CB", "LeftTriangleBar": "\u29CF", "LeftTriangle": "\u22B2", "LeftTriangleEqual": "\u22B4", "LeftUpDownVector": "\u2951", "LeftUpTeeVector": "\u2960", "LeftUpVectorBar": "\u2958", "LeftUpVector": "\u21BF", "LeftVectorBar": "\u2952", "LeftVector": "\u21BC", "lEg": "\u2A8B", "leg": "\u22DA", "leq": "\u2264", "leqq": "\u2266", "leqslant": "\u2A7D", "lescc": "\u2AA8", "les": "\u2A7D", "lesdot": "\u2A7F", "lesdoto": "\u2A81", "lesdotor": "\u2A83", "lesg": "\u22DA\uFE00", "lesges": "\u2A93", "lessapprox": "\u2A85", "lessdot": "\u22D6", "lesseqgtr": "\u22DA", "lesseqqgtr": "\u2A8B", "LessEqualGreater": "\u22DA", "LessFullEqual": "\u2266", "LessGreater": "\u2276", "lessgtr": "\u2276", "LessLess": "\u2AA1", "lesssim": "\u2272", "LessSlantEqual": "\u2A7D", "LessTilde": "\u2272", "lfisht": "\u297C", "lfloor": "\u230A", "Lfr": "\uD835\uDD0F", "lfr": "\uD835\uDD29", "lg": "\u2276", "lgE": "\u2A91", "lHar": "\u2962", "lhard": "\u21BD", "lharu": "\u21BC", "lharul": "\u296A", "lhblk": "\u2584", "LJcy": "\u0409", "ljcy": "\u0459", "llarr": "\u21C7", "ll": "\u226A", "Ll": "\u22D8", "llcorner": "\u231E", "Lleftarrow": "\u21DA", "llhard": "\u296B", "lltri": "\u25FA", "Lmidot": "\u013F", "lmidot": "\u0140", "lmoustache": "\u23B0", "lmoust": "\u23B0", "lnap": "\u2A89", "lnapprox": "\u2A89", "lne": "\u2A87", "lnE": "\u2268", "lneq": "\u2A87", "lneqq": "\u2268", "lnsim": "\u22E6", "loang": "\u27EC", "loarr": "\u21FD", "lobrk": "\u27E6", "longleftarrow": "\u27F5", "LongLeftArrow": "\u27F5", "Longleftarrow": "\u27F8", "longleftrightarrow": "\u27F7", "LongLeftRightArrow": "\u27F7", "Longleftrightarrow": "\u27FA", "longmapsto": "\u27FC", "longrightarrow": "\u27F6", "LongRightArrow": "\u27F6", "Longrightarrow": "\u27F9", "looparrowleft": "\u21AB", "looparrowright": "\u21AC", "lopar": "\u2985", "Lopf": "\uD835\uDD43", "lopf": "\uD835\uDD5D", "loplus": "\u2A2D", "lotimes": "\u2A34", "lowast": "\u2217", "lowbar": "_", "LowerLeftArrow": "\u2199", "LowerRightArrow": "\u2198", "loz": "\u25CA", "lozenge": "\u25CA", "lozf": "\u29EB", "lpar": "(", "lparlt": "\u2993", "lrarr": "\u21C6", "lrcorner": "\u231F", "lrhar": "\u21CB", "lrhard": "\u296D", "lrm": "\u200E", "lrtri": "\u22BF", "lsaquo": "\u2039", "lscr": "\uD835\uDCC1", "Lscr": "\u2112", "lsh": "\u21B0", "Lsh": "\u21B0", "lsim": "\u2272", "lsime": "\u2A8D", "lsimg": "\u2A8F", "lsqb": "[", "lsquo": "\u2018", "lsquor": "\u201A", "Lstrok": "\u0141", "lstrok": "\u0142", "ltcc": "\u2AA6", "ltcir": "\u2A79", "lt": "<", "LT": "<", "Lt": "\u226A", "ltdot": "\u22D6", "lthree": "\u22CB", "ltimes": "\u22C9", "ltlarr": "\u2976", "ltquest": "\u2A7B", "ltri": "\u25C3", "ltrie": "\u22B4", "ltrif": "\u25C2", "ltrPar": "\u2996", "lurdshar": "\u294A", "luruhar": "\u2966", "lvertneqq": "\u2268\uFE00", "lvnE": "\u2268\uFE00", "macr": "\u00AF", "male": "\u2642", "malt": "\u2720", "maltese": "\u2720", "Map": "\u2905", "map": "\u21A6", "mapsto": "\u21A6", "mapstodown": "\u21A7", "mapstoleft": "\u21A4", "mapstoup": "\u21A5", "marker": "\u25AE", "mcomma": "\u2A29", "Mcy": "\u041C", "mcy": "\u043C", "mdash": "\u2014", "mDDot": "\u223A", "measuredangle": "\u2221", "MediumSpace": "\u205F", "Mellintrf": "\u2133", "Mfr": "\uD835\uDD10", "mfr": "\uD835\uDD2A", "mho": "\u2127", "micro": "\u00B5", "midast": "*", "midcir": "\u2AF0", "mid": "\u2223", "middot": "\u00B7", "minusb": "\u229F", "minus": "\u2212", "minusd": "\u2238", "minusdu": "\u2A2A", "MinusPlus": "\u2213", "mlcp": "\u2ADB", "mldr": "\u2026", "mnplus": "\u2213", "models": "\u22A7", "Mopf": "\uD835\uDD44", "mopf": "\uD835\uDD5E", "mp": "\u2213", "mscr": "\uD835\uDCC2", "Mscr": "\u2133", "mstpos": "\u223E", "Mu": "\u039C", "mu": "\u03BC", "multimap": "\u22B8", "mumap": "\u22B8", "nabla": "\u2207", "Nacute": "\u0143", "nacute": "\u0144", "nang": "\u2220\u20D2", "nap": "\u2249", "napE": "\u2A70\u0338", "napid": "\u224B\u0338", "napos": "\u0149", "napprox": "\u2249", "natural": "\u266E", "naturals": "\u2115", "natur": "\u266E", "nbsp": "\u00A0", "nbump": "\u224E\u0338", "nbumpe": "\u224F\u0338", "ncap": "\u2A43", "Ncaron": "\u0147", "ncaron": "\u0148", "Ncedil": "\u0145", "ncedil": "\u0146", "ncong": "\u2247", "ncongdot": "\u2A6D\u0338", "ncup": "\u2A42", "Ncy": "\u041D", "ncy": "\u043D", "ndash": "\u2013", "nearhk": "\u2924", "nearr": "\u2197", "neArr": "\u21D7", "nearrow": "\u2197", "ne": "\u2260", "nedot": "\u2250\u0338", "NegativeMediumSpace": "\u200B", "NegativeThickSpace": "\u200B", "NegativeThinSpace": "\u200B", "NegativeVeryThinSpace": "\u200B", "nequiv": "\u2262", "nesear": "\u2928", "nesim": "\u2242\u0338", "NestedGreaterGreater": "\u226B", "NestedLessLess": "\u226A", "NewLine": "\n", "nexist": "\u2204", "nexists": "\u2204", "Nfr": "\uD835\uDD11", "nfr": "\uD835\uDD2B", "ngE": "\u2267\u0338", "nge": "\u2271", "ngeq": "\u2271", "ngeqq": "\u2267\u0338", "ngeqslant": "\u2A7E\u0338", "nges": "\u2A7E\u0338", "nGg": "\u22D9\u0338", "ngsim": "\u2275", "nGt": "\u226B\u20D2", "ngt": "\u226F", "ngtr": "\u226F", "nGtv": "\u226B\u0338", "nharr": "\u21AE", "nhArr": "\u21CE", "nhpar": "\u2AF2", "ni": "\u220B", "nis": "\u22FC", "nisd": "\u22FA", "niv": "\u220B", "NJcy": "\u040A", "njcy": "\u045A", "nlarr": "\u219A", "nlArr": "\u21CD", "nldr": "\u2025", "nlE": "\u2266\u0338", "nle": "\u2270", "nleftarrow": "\u219A", "nLeftarrow": "\u21CD", "nleftrightarrow": "\u21AE", "nLeftrightarrow": "\u21CE", "nleq": "\u2270", "nleqq": "\u2266\u0338", "nleqslant": "\u2A7D\u0338", "nles": "\u2A7D\u0338", "nless": "\u226E", "nLl": "\u22D8\u0338", "nlsim": "\u2274", "nLt": "\u226A\u20D2", "nlt": "\u226E", "nltri": "\u22EA", "nltrie": "\u22EC", "nLtv": "\u226A\u0338", "nmid": "\u2224", "NoBreak": "\u2060", "NonBreakingSpace": "\u00A0", "nopf": "\uD835\uDD5F", "Nopf": "\u2115", "Not": "\u2AEC", "not": "\u00AC", "NotCongruent": "\u2262", "NotCupCap": "\u226D", "NotDoubleVerticalBar": "\u2226", "NotElement": "\u2209", "NotEqual": "\u2260", "NotEqualTilde": "\u2242\u0338", "NotExists": "\u2204", "NotGreater": "\u226F", "NotGreaterEqual": "\u2271", "NotGreaterFullEqual": "\u2267\u0338", "NotGreaterGreater": "\u226B\u0338", "NotGreaterLess": "\u2279", "NotGreaterSlantEqual": "\u2A7E\u0338", "NotGreaterTilde": "\u2275", "NotHumpDownHump": "\u224E\u0338", "NotHumpEqual": "\u224F\u0338", "notin": "\u2209", "notindot": "\u22F5\u0338", "notinE": "\u22F9\u0338", "notinva": "\u2209", "notinvb": "\u22F7", "notinvc": "\u22F6", "NotLeftTriangleBar": "\u29CF\u0338", "NotLeftTriangle": "\u22EA", "NotLeftTriangleEqual": "\u22EC", "NotLess": "\u226E", "NotLessEqual": "\u2270", "NotLessGreater": "\u2278", "NotLessLess": "\u226A\u0338", "NotLessSlantEqual": "\u2A7D\u0338", "NotLessTilde": "\u2274", "NotNestedGreaterGreater": "\u2AA2\u0338", "NotNestedLessLess": "\u2AA1\u0338", "notni": "\u220C", "notniva": "\u220C", "notnivb": "\u22FE", "notnivc": "\u22FD", "NotPrecedes": "\u2280", "NotPrecedesEqual": "\u2AAF\u0338", "NotPrecedesSlantEqual": "\u22E0", "NotReverseElement": "\u220C", "NotRightTriangleBar": "\u29D0\u0338", "NotRightTriangle": "\u22EB", "NotRightTriangleEqual": "\u22ED", "NotSquareSubset": "\u228F\u0338", "NotSquareSubsetEqual": "\u22E2", "NotSquareSuperset": "\u2290\u0338", "NotSquareSupersetEqual": "\u22E3", "NotSubset": "\u2282\u20D2", "NotSubsetEqual": "\u2288", "NotSucceeds": "\u2281", "NotSucceedsEqual": "\u2AB0\u0338", "NotSucceedsSlantEqual": "\u22E1", "NotSucceedsTilde": "\u227F\u0338", "NotSuperset": "\u2283\u20D2", "NotSupersetEqual": "\u2289", "NotTilde": "\u2241", "NotTildeEqual": "\u2244", "NotTildeFullEqual": "\u2247", "NotTildeTilde": "\u2249", "NotVerticalBar": "\u2224", "nparallel": "\u2226", "npar": "\u2226", "nparsl": "\u2AFD\u20E5", "npart": "\u2202\u0338", "npolint": "\u2A14", "npr": "\u2280", "nprcue": "\u22E0", "nprec": "\u2280", "npreceq": "\u2AAF\u0338", "npre": "\u2AAF\u0338", "nrarrc": "\u2933\u0338", "nrarr": "\u219B", "nrArr": "\u21CF", "nrarrw": "\u219D\u0338", "nrightarrow": "\u219B", "nRightarrow": "\u21CF", "nrtri": "\u22EB", "nrtrie": "\u22ED", "nsc": "\u2281", "nsccue": "\u22E1", "nsce": "\u2AB0\u0338", "Nscr": "\uD835\uDCA9", "nscr": "\uD835\uDCC3", "nshortmid": "\u2224", "nshortparallel": "\u2226", "nsim": "\u2241", "nsime": "\u2244", "nsimeq": "\u2244", "nsmid": "\u2224", "nspar": "\u2226", "nsqsube": "\u22E2", "nsqsupe": "\u22E3", "nsub": "\u2284", "nsubE": "\u2AC5\u0338", "nsube": "\u2288", "nsubset": "\u2282\u20D2", "nsubseteq": "\u2288", "nsubseteqq": "\u2AC5\u0338", "nsucc": "\u2281", "nsucceq": "\u2AB0\u0338", "nsup": "\u2285", "nsupE": "\u2AC6\u0338", "nsupe": "\u2289", "nsupset": "\u2283\u20D2", "nsupseteq": "\u2289", "nsupseteqq": "\u2AC6\u0338", "ntgl": "\u2279", "Ntilde": "\u00D1", "ntilde": "\u00F1", "ntlg": "\u2278", "ntriangleleft": "\u22EA", "ntrianglelefteq": "\u22EC", "ntriangleright": "\u22EB", "ntrianglerighteq": "\u22ED", "Nu": "\u039D", "nu": "\u03BD", "num": "#", "numero": "\u2116", "numsp": "\u2007", "nvap": "\u224D\u20D2", "nvdash": "\u22AC", "nvDash": "\u22AD", "nVdash": "\u22AE", "nVDash": "\u22AF", "nvge": "\u2265\u20D2", "nvgt": ">\u20D2", "nvHarr": "\u2904", "nvinfin": "\u29DE", "nvlArr": "\u2902", "nvle": "\u2264\u20D2", "nvlt": "<\u20D2", "nvltrie": "\u22B4\u20D2", "nvrArr": "\u2903", "nvrtrie": "\u22B5\u20D2", "nvsim": "\u223C\u20D2", "nwarhk": "\u2923", "nwarr": "\u2196", "nwArr": "\u21D6", "nwarrow": "\u2196", "nwnear": "\u2927", "Oacute": "\u00D3", "oacute": "\u00F3", "oast": "\u229B", "Ocirc": "\u00D4", "ocirc": "\u00F4", "ocir": "\u229A", "Ocy": "\u041E", "ocy": "\u043E", "odash": "\u229D", "Odblac": "\u0150", "odblac": "\u0151", "odiv": "\u2A38", "odot": "\u2299", "odsold": "\u29BC", "OElig": "\u0152", "oelig": "\u0153", "ofcir": "\u29BF", "Ofr": "\uD835\uDD12", "ofr": "\uD835\uDD2C", "ogon": "\u02DB", "Ograve": "\u00D2", "ograve": "\u00F2", "ogt": "\u29C1", "ohbar": "\u29B5", "ohm": "\u03A9", "oint": "\u222E", "olarr": "\u21BA", "olcir": "\u29BE", "olcross": "\u29BB", "oline": "\u203E", "olt": "\u29C0", "Omacr": "\u014C", "omacr": "\u014D", "Omega": "\u03A9", "omega": "\u03C9", "Omicron": "\u039F", "omicron": "\u03BF", "omid": "\u29B6", "ominus": "\u2296", "Oopf": "\uD835\uDD46", "oopf": "\uD835\uDD60", "opar": "\u29B7", "OpenCurlyDoubleQuote": "\u201C", "OpenCurlyQuote": "\u2018", "operp": "\u29B9", "oplus": "\u2295", "orarr": "\u21BB", "Or": "\u2A54", "or": "\u2228", "ord": "\u2A5D", "order": "\u2134", "orderof": "\u2134", "ordf": "\u00AA", "ordm": "\u00BA", "origof": "\u22B6", "oror": "\u2A56", "orslope": "\u2A57", "orv": "\u2A5B", "oS": "\u24C8", "Oscr": "\uD835\uDCAA", "oscr": "\u2134", "Oslash": "\u00D8", "oslash": "\u00F8", "osol": "\u2298", "Otilde": "\u00D5", "otilde": "\u00F5", "otimesas": "\u2A36", "Otimes": "\u2A37", "otimes": "\u2297", "Ouml": "\u00D6", "ouml": "\u00F6", "ovbar": "\u233D", "OverBar": "\u203E", "OverBrace": "\u23DE", "OverBracket": "\u23B4", "OverParenthesis": "\u23DC", "para": "\u00B6", "parallel": "\u2225", "par": "\u2225", "parsim": "\u2AF3", "parsl": "\u2AFD", "part": "\u2202", "PartialD": "\u2202", "Pcy": "\u041F", "pcy": "\u043F", "percnt": "%", "period": ".", "permil": "\u2030", "perp": "\u22A5", "pertenk": "\u2031", "Pfr": "\uD835\uDD13", "pfr": "\uD835\uDD2D", "Phi": "\u03A6", "phi": "\u03C6", "phiv": "\u03D5", "phmmat": "\u2133", "phone": "\u260E", "Pi": "\u03A0", "pi": "\u03C0", "pitchfork": "\u22D4", "piv": "\u03D6", "planck": "\u210F", "planckh": "\u210E", "plankv": "\u210F", "plusacir": "\u2A23", "plusb": "\u229E", "pluscir": "\u2A22", "plus": "+", "plusdo": "\u2214", "plusdu": "\u2A25", "pluse": "\u2A72", "PlusMinus": "\u00B1", "plusmn": "\u00B1", "plussim": "\u2A26", "plustwo": "\u2A27", "pm": "\u00B1", "Poincareplane": "\u210C", "pointint": "\u2A15", "popf": "\uD835\uDD61", "Popf": "\u2119", "pound": "\u00A3", "prap": "\u2AB7", "Pr": "\u2ABB", "pr": "\u227A", "prcue": "\u227C", "precapprox": "\u2AB7", "prec": "\u227A", "preccurlyeq": "\u227C", "Precedes": "\u227A", "PrecedesEqual": "\u2AAF", "PrecedesSlantEqual": "\u227C", "PrecedesTilde": "\u227E", "preceq": "\u2AAF", "precnapprox": "\u2AB9", "precneqq": "\u2AB5", "precnsim": "\u22E8", "pre": "\u2AAF", "prE": "\u2AB3", "precsim": "\u227E", "prime": "\u2032", "Prime": "\u2033", "primes": "\u2119", "prnap": "\u2AB9", "prnE": "\u2AB5", "prnsim": "\u22E8", "prod": "\u220F", "Product": "\u220F", "profalar": "\u232E", "profline": "\u2312", "profsurf": "\u2313", "prop": "\u221D", "Proportional": "\u221D", "Proportion": "\u2237", "propto": "\u221D", "prsim": "\u227E", "prurel": "\u22B0", "Pscr": "\uD835\uDCAB", "pscr": "\uD835\uDCC5", "Psi": "\u03A8", "psi": "\u03C8", "puncsp": "\u2008", "Qfr": "\uD835\uDD14", "qfr": "\uD835\uDD2E", "qint": "\u2A0C", "qopf": "\uD835\uDD62", "Qopf": "\u211A", "qprime": "\u2057", "Qscr": "\uD835\uDCAC", "qscr": "\uD835\uDCC6", "quaternions": "\u210D", "quatint": "\u2A16", "quest": "?", "questeq": "\u225F", "quot": "\"", "QUOT": "\"", "rAarr": "\u21DB", "race": "\u223D\u0331", "Racute": "\u0154", "racute": "\u0155", "radic": "\u221A", "raemptyv": "\u29B3", "rang": "\u27E9", "Rang": "\u27EB", "rangd": "\u2992", "range": "\u29A5", "rangle": "\u27E9", "raquo": "\u00BB", "rarrap": "\u2975", "rarrb": "\u21E5", "rarrbfs": "\u2920", "rarrc": "\u2933", "rarr": "\u2192", "Rarr": "\u21A0", "rArr": "\u21D2", "rarrfs": "\u291E", "rarrhk": "\u21AA", "rarrlp": "\u21AC", "rarrpl": "\u2945", "rarrsim": "\u2974", "Rarrtl": "\u2916", "rarrtl": "\u21A3", "rarrw": "\u219D", "ratail": "\u291A", "rAtail": "\u291C", "ratio": "\u2236", "rationals": "\u211A", "rbarr": "\u290D", "rBarr": "\u290F", "RBarr": "\u2910", "rbbrk": "\u2773", "rbrace": "}", "rbrack": "]", "rbrke": "\u298C", "rbrksld": "\u298E", "rbrkslu": "\u2990", "Rcaron": "\u0158", "rcaron": "\u0159", "Rcedil": "\u0156", "rcedil": "\u0157", "rceil": "\u2309", "rcub": "}", "Rcy": "\u0420", "rcy": "\u0440", "rdca": "\u2937", "rdldhar": "\u2969", "rdquo": "\u201D", "rdquor": "\u201D", "rdsh": "\u21B3", "real": "\u211C", "realine": "\u211B", "realpart": "\u211C", "reals": "\u211D", "Re": "\u211C", "rect": "\u25AD", "reg": "\u00AE", "REG": "\u00AE", "ReverseElement": "\u220B", "ReverseEquilibrium": "\u21CB", "ReverseUpEquilibrium": "\u296F", "rfisht": "\u297D", "rfloor": "\u230B", "rfr": "\uD835\uDD2F", "Rfr": "\u211C", "rHar": "\u2964", "rhard": "\u21C1", "rharu": "\u21C0", "rharul": "\u296C", "Rho": "\u03A1", "rho": "\u03C1", "rhov": "\u03F1", "RightAngleBracket": "\u27E9", "RightArrowBar": "\u21E5", "rightarrow": "\u2192", "RightArrow": "\u2192", "Rightarrow": "\u21D2", "RightArrowLeftArrow": "\u21C4", "rightarrowtail": "\u21A3", "RightCeiling": "\u2309", "RightDoubleBracket": "\u27E7", "RightDownTeeVector": "\u295D", "RightDownVectorBar": "\u2955", "RightDownVector": "\u21C2", "RightFloor": "\u230B", "rightharpoondown": "\u21C1", "rightharpoonup": "\u21C0", "rightleftarrows": "\u21C4", "rightleftharpoons": "\u21CC", "rightrightarrows": "\u21C9", "rightsquigarrow": "\u219D", "RightTeeArrow": "\u21A6", "RightTee": "\u22A2", "RightTeeVector": "\u295B", "rightthreetimes": "\u22CC", "RightTriangleBar": "\u29D0", "RightTriangle": "\u22B3", "RightTriangleEqual": "\u22B5", "RightUpDownVector": "\u294F", "RightUpTeeVector": "\u295C", "RightUpVectorBar": "\u2954", "RightUpVector": "\u21BE", "RightVectorBar": "\u2953", "RightVector": "\u21C0", "ring": "\u02DA", "risingdotseq": "\u2253", "rlarr": "\u21C4", "rlhar": "\u21CC", "rlm": "\u200F", "rmoustache": "\u23B1", "rmoust": "\u23B1", "rnmid": "\u2AEE", "roang": "\u27ED", "roarr": "\u21FE", "robrk": "\u27E7", "ropar": "\u2986", "ropf": "\uD835\uDD63", "Ropf": "\u211D", "roplus": "\u2A2E", "rotimes": "\u2A35", "RoundImplies": "\u2970", "rpar": ")", "rpargt": "\u2994", "rppolint": "\u2A12", "rrarr": "\u21C9", "Rrightarrow": "\u21DB", "rsaquo": "\u203A", "rscr": "\uD835\uDCC7", "Rscr": "\u211B", "rsh": "\u21B1", "Rsh": "\u21B1", "rsqb": "]", "rsquo": "\u2019", "rsquor": "\u2019", "rthree": "\u22CC", "rtimes": "\u22CA", "rtri": "\u25B9", "rtrie": "\u22B5", "rtrif": "\u25B8", "rtriltri": "\u29CE", "RuleDelayed": "\u29F4", "ruluhar": "\u2968", "rx": "\u211E", "Sacute": "\u015A", "sacute": "\u015B", "sbquo": "\u201A", "scap": "\u2AB8", "Scaron": "\u0160", "scaron": "\u0161", "Sc": "\u2ABC", "sc": "\u227B", "sccue": "\u227D", "sce": "\u2AB0", "scE": "\u2AB4", "Scedil": "\u015E", "scedil": "\u015F", "Scirc": "\u015C", "scirc": "\u015D", "scnap": "\u2ABA", "scnE": "\u2AB6", "scnsim": "\u22E9", "scpolint": "\u2A13", "scsim": "\u227F", "Scy": "\u0421", "scy": "\u0441", "sdotb": "\u22A1", "sdot": "\u22C5", "sdote": "\u2A66", "searhk": "\u2925", "searr": "\u2198", "seArr": "\u21D8", "searrow": "\u2198", "sect": "\u00A7", "semi": ";", "seswar": "\u2929", "setminus": "\u2216", "setmn": "\u2216", "sext": "\u2736", "Sfr": "\uD835\uDD16", "sfr": "\uD835\uDD30", "sfrown": "\u2322", "sharp": "\u266F", "SHCHcy": "\u0429", "shchcy": "\u0449", "SHcy": "\u0428", "shcy": "\u0448", "ShortDownArrow": "\u2193", "ShortLeftArrow": "\u2190", "shortmid": "\u2223", "shortparallel": "\u2225", "ShortRightArrow": "\u2192", "ShortUpArrow": "\u2191", "shy": "\u00AD", "Sigma": "\u03A3", "sigma": "\u03C3", "sigmaf": "\u03C2", "sigmav": "\u03C2", "sim": "\u223C", "simdot": "\u2A6A", "sime": "\u2243", "simeq": "\u2243", "simg": "\u2A9E", "simgE": "\u2AA0", "siml": "\u2A9D", "simlE": "\u2A9F", "simne": "\u2246", "simplus": "\u2A24", "simrarr": "\u2972", "slarr": "\u2190", "SmallCircle": "\u2218", "smallsetminus": "\u2216", "smashp": "\u2A33", "smeparsl": "\u29E4", "smid": "\u2223", "smile": "\u2323", "smt": "\u2AAA", "smte": "\u2AAC", "smtes": "\u2AAC\uFE00", "SOFTcy": "\u042C", "softcy": "\u044C", "solbar": "\u233F", "solb": "\u29C4", "sol": "/", "Sopf": "\uD835\uDD4A", "sopf": "\uD835\uDD64", "spades": "\u2660", "spadesuit": "\u2660", "spar": "\u2225", "sqcap": "\u2293", "sqcaps": "\u2293\uFE00", "sqcup": "\u2294", "sqcups": "\u2294\uFE00", "Sqrt": "\u221A", "sqsub": "\u228F", "sqsube": "\u2291", "sqsubset": "\u228F", "sqsubseteq": "\u2291", "sqsup": "\u2290", "sqsupe": "\u2292", "sqsupset": "\u2290", "sqsupseteq": "\u2292", "square": "\u25A1", "Square": "\u25A1", "SquareIntersection": "\u2293", "SquareSubset": "\u228F", "SquareSubsetEqual": "\u2291", "SquareSuperset": "\u2290", "SquareSupersetEqual": "\u2292", "SquareUnion": "\u2294", "squarf": "\u25AA", "squ": "\u25A1", "squf": "\u25AA", "srarr": "\u2192", "Sscr": "\uD835\uDCAE", "sscr": "\uD835\uDCC8", "ssetmn": "\u2216", "ssmile": "\u2323", "sstarf": "\u22C6", "Star": "\u22C6", "star": "\u2606", "starf": "\u2605", "straightepsilon": "\u03F5", "straightphi": "\u03D5", "strns": "\u00AF", "sub": "\u2282", "Sub": "\u22D0", "subdot": "\u2ABD", "subE": "\u2AC5", "sube": "\u2286", "subedot": "\u2AC3", "submult": "\u2AC1", "subnE": "\u2ACB", "subne": "\u228A", "subplus": "\u2ABF", "subrarr": "\u2979", "subset": "\u2282", "Subset": "\u22D0", "subseteq": "\u2286", "subseteqq": "\u2AC5", "SubsetEqual": "\u2286", "subsetneq": "\u228A", "subsetneqq": "\u2ACB", "subsim": "\u2AC7", "subsub": "\u2AD5", "subsup": "\u2AD3", "succapprox": "\u2AB8", "succ": "\u227B", "succcurlyeq": "\u227D", "Succeeds": "\u227B", "SucceedsEqual": "\u2AB0", "SucceedsSlantEqual": "\u227D", "SucceedsTilde": "\u227F", "succeq": "\u2AB0", "succnapprox": "\u2ABA", "succneqq": "\u2AB6", "succnsim": "\u22E9", "succsim": "\u227F", "SuchThat": "\u220B", "sum": "\u2211", "Sum": "\u2211", "sung": "\u266A", "sup1": "\u00B9", "sup2": "\u00B2", "sup3": "\u00B3", "sup": "\u2283", "Sup": "\u22D1", "supdot": "\u2ABE", "supdsub": "\u2AD8", "supE": "\u2AC6", "supe": "\u2287", "supedot": "\u2AC4", "Superset": "\u2283", "SupersetEqual": "\u2287", "suphsol": "\u27C9", "suphsub": "\u2AD7", "suplarr": "\u297B", "supmult": "\u2AC2", "supnE": "\u2ACC", "supne": "\u228B", "supplus": "\u2AC0", "supset": "\u2283", "Supset": "\u22D1", "supseteq": "\u2287", "supseteqq": "\u2AC6", "supsetneq": "\u228B", "supsetneqq": "\u2ACC", "supsim": "\u2AC8", "supsub": "\u2AD4", "supsup": "\u2AD6", "swarhk": "\u2926", "swarr": "\u2199", "swArr": "\u21D9", "swarrow": "\u2199", "swnwar": "\u292A", "szlig": "\u00DF", "Tab": "\t", "target": "\u2316", "Tau": "\u03A4", "tau": "\u03C4", "tbrk": "\u23B4", "Tcaron": "\u0164", "tcaron": "\u0165", "Tcedil": "\u0162", "tcedil": "\u0163", "Tcy": "\u0422", "tcy": "\u0442", "tdot": "\u20DB", "telrec": "\u2315", "Tfr": "\uD835\uDD17", "tfr": "\uD835\uDD31", "there4": "\u2234", "therefore": "\u2234", "Therefore": "\u2234", "Theta": "\u0398", "theta": "\u03B8", "thetasym": "\u03D1", "thetav": "\u03D1", "thickapprox": "\u2248", "thicksim": "\u223C", "ThickSpace": "\u205F\u200A", "ThinSpace": "\u2009", "thinsp": "\u2009", "thkap": "\u2248", "thksim": "\u223C", "THORN": "\u00DE", "thorn": "\u00FE", "tilde": "\u02DC", "Tilde": "\u223C", "TildeEqual": "\u2243", "TildeFullEqual": "\u2245", "TildeTilde": "\u2248", "timesbar": "\u2A31", "timesb": "\u22A0", "times": "\u00D7", "timesd": "\u2A30", "tint": "\u222D", "toea": "\u2928", "topbot": "\u2336", "topcir": "\u2AF1", "top": "\u22A4", "Topf": "\uD835\uDD4B", "topf": "\uD835\uDD65", "topfork": "\u2ADA", "tosa": "\u2929", "tprime": "\u2034", "trade": "\u2122", "TRADE": "\u2122", "triangle": "\u25B5", "triangledown": "\u25BF", "triangleleft": "\u25C3", "trianglelefteq": "\u22B4", "triangleq": "\u225C", "triangleright": "\u25B9", "trianglerighteq": "\u22B5", "tridot": "\u25EC", "trie": "\u225C", "triminus": "\u2A3A", "TripleDot": "\u20DB", "triplus": "\u2A39", "trisb": "\u29CD", "tritime": "\u2A3B", "trpezium": "\u23E2", "Tscr": "\uD835\uDCAF", "tscr": "\uD835\uDCC9", "TScy": "\u0426", "tscy": "\u0446", "TSHcy": "\u040B", "tshcy": "\u045B", "Tstrok": "\u0166", "tstrok": "\u0167", "twixt": "\u226C", "twoheadleftarrow": "\u219E", "twoheadrightarrow": "\u21A0", "Uacute": "\u00DA", "uacute": "\u00FA", "uarr": "\u2191", "Uarr": "\u219F", "uArr": "\u21D1", "Uarrocir": "\u2949", "Ubrcy": "\u040E", "ubrcy": "\u045E", "Ubreve": "\u016C", "ubreve": "\u016D", "Ucirc": "\u00DB", "ucirc": "\u00FB", "Ucy": "\u0423", "ucy": "\u0443", "udarr": "\u21C5", "Udblac": "\u0170", "udblac": "\u0171", "udhar": "\u296E", "ufisht": "\u297E", "Ufr": "\uD835\uDD18", "ufr": "\uD835\uDD32", "Ugrave": "\u00D9", "ugrave": "\u00F9", "uHar": "\u2963", "uharl": "\u21BF", "uharr": "\u21BE", "uhblk": "\u2580", "ulcorn": "\u231C", "ulcorner": "\u231C", "ulcrop": "\u230F", "ultri": "\u25F8", "Umacr": "\u016A", "umacr": "\u016B", "uml": "\u00A8", "UnderBar": "_", "UnderBrace": "\u23DF", "UnderBracket": "\u23B5", "UnderParenthesis": "\u23DD", "Union": "\u22C3", "UnionPlus": "\u228E", "Uogon": "\u0172", "uogon": "\u0173", "Uopf": "\uD835\uDD4C", "uopf": "\uD835\uDD66", "UpArrowBar": "\u2912", "uparrow": "\u2191", "UpArrow": "\u2191", "Uparrow": "\u21D1", "UpArrowDownArrow": "\u21C5", "updownarrow": "\u2195", "UpDownArrow": "\u2195", "Updownarrow": "\u21D5", "UpEquilibrium": "\u296E", "upharpoonleft": "\u21BF", "upharpoonright": "\u21BE", "uplus": "\u228E", "UpperLeftArrow": "\u2196", "UpperRightArrow": "\u2197", "upsi": "\u03C5", "Upsi": "\u03D2", "upsih": "\u03D2", "Upsilon": "\u03A5", "upsilon": "\u03C5", "UpTeeArrow": "\u21A5", "UpTee": "\u22A5", "upuparrows": "\u21C8", "urcorn": "\u231D", "urcorner": "\u231D", "urcrop": "\u230E", "Uring": "\u016E", "uring": "\u016F", "urtri": "\u25F9", "Uscr": "\uD835\uDCB0", "uscr": "\uD835\uDCCA", "utdot": "\u22F0", "Utilde": "\u0168", "utilde": "\u0169", "utri": "\u25B5", "utrif": "\u25B4", "uuarr": "\u21C8", "Uuml": "\u00DC", "uuml": "\u00FC", "uwangle": "\u29A7", "vangrt": "\u299C", "varepsilon": "\u03F5", "varkappa": "\u03F0", "varnothing": "\u2205", "varphi": "\u03D5", "varpi": "\u03D6", "varpropto": "\u221D", "varr": "\u2195", "vArr": "\u21D5", "varrho": "\u03F1", "varsigma": "\u03C2", "varsubsetneq": "\u228A\uFE00", "varsubsetneqq": "\u2ACB\uFE00", "varsupsetneq": "\u228B\uFE00", "varsupsetneqq": "\u2ACC\uFE00", "vartheta": "\u03D1", "vartriangleleft": "\u22B2", "vartriangleright": "\u22B3", "vBar": "\u2AE8", "Vbar": "\u2AEB", "vBarv": "\u2AE9", "Vcy": "\u0412", "vcy": "\u0432", "vdash": "\u22A2", "vDash": "\u22A8", "Vdash": "\u22A9", "VDash": "\u22AB", "Vdashl": "\u2AE6", "veebar": "\u22BB", "vee": "\u2228", "Vee": "\u22C1", "veeeq": "\u225A", "vellip": "\u22EE", "verbar": "|", "Verbar": "\u2016", "vert": "|", "Vert": "\u2016", "VerticalBar": "\u2223", "VerticalLine": "|", "VerticalSeparator": "\u2758", "VerticalTilde": "\u2240", "VeryThinSpace": "\u200A", "Vfr": "\uD835\uDD19", "vfr": "\uD835\uDD33", "vltri": "\u22B2", "vnsub": "\u2282\u20D2", "vnsup": "\u2283\u20D2", "Vopf": "\uD835\uDD4D", "vopf": "\uD835\uDD67", "vprop": "\u221D", "vrtri": "\u22B3", "Vscr": "\uD835\uDCB1", "vscr": "\uD835\uDCCB", "vsubnE": "\u2ACB\uFE00", "vsubne": "\u228A\uFE00", "vsupnE": "\u2ACC\uFE00", "vsupne": "\u228B\uFE00", "Vvdash": "\u22AA", "vzigzag": "\u299A", "Wcirc": "\u0174", "wcirc": "\u0175", "wedbar": "\u2A5F", "wedge": "\u2227", "Wedge": "\u22C0", "wedgeq": "\u2259", "weierp": "\u2118", "Wfr": "\uD835\uDD1A", "wfr": "\uD835\uDD34", "Wopf": "\uD835\uDD4E", "wopf": "\uD835\uDD68", "wp": "\u2118", "wr": "\u2240", "wreath": "\u2240", "Wscr": "\uD835\uDCB2", "wscr": "\uD835\uDCCC", "xcap": "\u22C2", "xcirc": "\u25EF", "xcup": "\u22C3", "xdtri": "\u25BD", "Xfr": "\uD835\uDD1B", "xfr": "\uD835\uDD35", "xharr": "\u27F7", "xhArr": "\u27FA", "Xi": "\u039E", "xi": "\u03BE", "xlarr": "\u27F5", "xlArr": "\u27F8", "xmap": "\u27FC", "xnis": "\u22FB", "xodot": "\u2A00", "Xopf": "\uD835\uDD4F", "xopf": "\uD835\uDD69", "xoplus": "\u2A01", "xotime": "\u2A02", "xrarr": "\u27F6", "xrArr": "\u27F9", "Xscr": "\uD835\uDCB3", "xscr": "\uD835\uDCCD", "xsqcup": "\u2A06", "xuplus": "\u2A04", "xutri": "\u25B3", "xvee": "\u22C1", "xwedge": "\u22C0", "Yacute": "\u00DD", "yacute": "\u00FD", "YAcy": "\u042F", "yacy": "\u044F", "Ycirc": "\u0176", "ycirc": "\u0177", "Ycy": "\u042B", "ycy": "\u044B", "yen": "\u00A5", "Yfr": "\uD835\uDD1C", "yfr": "\uD835\uDD36", "YIcy": "\u0407", "yicy": "\u0457", "Yopf": "\uD835\uDD50", "yopf": "\uD835\uDD6A", "Yscr": "\uD835\uDCB4", "yscr": "\uD835\uDCCE", "YUcy": "\u042E", "yucy": "\u044E", "yuml": "\u00FF", "Yuml": "\u0178", "Zacute": "\u0179", "zacute": "\u017A", "Zcaron": "\u017D", "zcaron": "\u017E", "Zcy": "\u0417", "zcy": "\u0437", "Zdot": "\u017B", "zdot": "\u017C", "zeetrf": "\u2128", "ZeroWidthSpace": "\u200B", "Zeta": "\u0396", "zeta": "\u03B6", "zfr": "\uD835\uDD37", "Zfr": "\u2128", "ZHcy": "\u0416", "zhcy": "\u0436", "zigrarr": "\u21DD", "zopf": "\uD835\uDD6B", "Zopf": "\u2124", "Zscr": "\uD835\uDCB5", "zscr": "\uD835\uDCCF", "zwj": "\u200D", "zwnj": "\u200C" };

    },{}],53:[function(require,module,exports){


    ////////////////////////////////////////////////////////////////////////////////
    // Helpers

    // Merge objects
    //
    function assign(obj /*from1, from2, from3, ...*/) {
      var sources = Array.prototype.slice.call(arguments, 1);

      sources.forEach(function (source) {
        if (!source) { return; }

        Object.keys(source).forEach(function (key) {
          obj[key] = source[key];
        });
      });

      return obj;
    }

    function _class(obj) { return Object.prototype.toString.call(obj); }
    function isString(obj) { return _class(obj) === '[object String]'; }
    function isObject(obj) { return _class(obj) === '[object Object]'; }
    function isRegExp(obj) { return _class(obj) === '[object RegExp]'; }
    function isFunction(obj) { return _class(obj) === '[object Function]'; }


    function escapeRE(str) { return str.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&'); }

    ////////////////////////////////////////////////////////////////////////////////


    var defaultOptions = {
      fuzzyLink: true,
      fuzzyEmail: true,
      fuzzyIP: false
    };


    function isOptionsObj(obj) {
      return Object.keys(obj || {}).reduce(function (acc, k) {
        return acc || defaultOptions.hasOwnProperty(k);
      }, false);
    }


    var defaultSchemas = {
      'http:': {
        validate: function (text, pos, self) {
          var tail = text.slice(pos);

          if (!self.re.http) {
            // compile lazily, because "host"-containing variables can change on tlds update.
            self.re.http =  new RegExp(
              '^\\/\\/' + self.re.src_auth + self.re.src_host_port_strict + self.re.src_path, 'i'
            );
          }
          if (self.re.http.test(tail)) {
            return tail.match(self.re.http)[0].length;
          }
          return 0;
        }
      },
      'https:':  'http:',
      'ftp:':    'http:',
      '//':      {
        validate: function (text, pos, self) {
          var tail = text.slice(pos);

          if (!self.re.no_http) {
          // compile lazily, because "host"-containing variables can change on tlds update.
            self.re.no_http =  new RegExp(
              '^' +
              self.re.src_auth +
              // Don't allow single-level domains, because of false positives like '//test'
              // with code comments
              '(?:localhost|(?:(?:' + self.re.src_domain + ')\\.)+' + self.re.src_domain_root + ')' +
              self.re.src_port +
              self.re.src_host_terminator +
              self.re.src_path,

              'i'
            );
          }

          if (self.re.no_http.test(tail)) {
            // should not be `://` & `///`, that protects from errors in protocol name
            if (pos >= 3 && text[pos - 3] === ':') { return 0; }
            if (pos >= 3 && text[pos - 3] === '/') { return 0; }
            return tail.match(self.re.no_http)[0].length;
          }
          return 0;
        }
      },
      'mailto:': {
        validate: function (text, pos, self) {
          var tail = text.slice(pos);

          if (!self.re.mailto) {
            self.re.mailto =  new RegExp(
              '^' + self.re.src_email_name + '@' + self.re.src_host_strict, 'i'
            );
          }
          if (self.re.mailto.test(tail)) {
            return tail.match(self.re.mailto)[0].length;
          }
          return 0;
        }
      }
    };

    /*eslint-disable max-len*/

    // RE pattern for 2-character tlds (autogenerated by ./support/tlds_2char_gen.js)
    var tlds_2ch_src_re = 'a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]';

    // DON'T try to make PRs with changes. Extend TLDs with LinkifyIt.tlds() instead
    var tlds_default = 'biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф'.split('|');

    /*eslint-enable max-len*/

    ////////////////////////////////////////////////////////////////////////////////

    function resetScanCache(self) {
      self.__index__ = -1;
      self.__text_cache__   = '';
    }

    function createValidator(re) {
      return function (text, pos) {
        var tail = text.slice(pos);

        if (re.test(tail)) {
          return tail.match(re)[0].length;
        }
        return 0;
      };
    }

    function createNormalizer() {
      return function (match, self) {
        self.normalize(match);
      };
    }

    // Schemas compiler. Build regexps.
    //
    function compile(self) {

      // Load & clone RE patterns.
      var re = self.re = require('./lib/re')(self.__opts__);

      // Define dynamic patterns
      var tlds = self.__tlds__.slice();

      self.onCompile();

      if (!self.__tlds_replaced__) {
        tlds.push(tlds_2ch_src_re);
      }
      tlds.push(re.src_xn);

      re.src_tlds = tlds.join('|');

      function untpl(tpl) { return tpl.replace('%TLDS%', re.src_tlds); }

      re.email_fuzzy      = RegExp(untpl(re.tpl_email_fuzzy), 'i');
      re.link_fuzzy       = RegExp(untpl(re.tpl_link_fuzzy), 'i');
      re.link_no_ip_fuzzy = RegExp(untpl(re.tpl_link_no_ip_fuzzy), 'i');
      re.host_fuzzy_test  = RegExp(untpl(re.tpl_host_fuzzy_test), 'i');

      //
      // Compile each schema
      //

      var aliases = [];

      self.__compiled__ = {}; // Reset compiled data

      function schemaError(name, val) {
        throw new Error('(LinkifyIt) Invalid schema "' + name + '": ' + val);
      }

      Object.keys(self.__schemas__).forEach(function (name) {
        var val = self.__schemas__[name];

        // skip disabled methods
        if (val === null) { return; }

        var compiled = { validate: null, link: null };

        self.__compiled__[name] = compiled;

        if (isObject(val)) {
          if (isRegExp(val.validate)) {
            compiled.validate = createValidator(val.validate);
          } else if (isFunction(val.validate)) {
            compiled.validate = val.validate;
          } else {
            schemaError(name, val);
          }

          if (isFunction(val.normalize)) {
            compiled.normalize = val.normalize;
          } else if (!val.normalize) {
            compiled.normalize = createNormalizer();
          } else {
            schemaError(name, val);
          }

          return;
        }

        if (isString(val)) {
          aliases.push(name);
          return;
        }

        schemaError(name, val);
      });

      //
      // Compile postponed aliases
      //

      aliases.forEach(function (alias) {
        if (!self.__compiled__[self.__schemas__[alias]]) {
          // Silently fail on missed schemas to avoid errons on disable.
          // schemaError(alias, self.__schemas__[alias]);
          return;
        }

        self.__compiled__[alias].validate =
          self.__compiled__[self.__schemas__[alias]].validate;
        self.__compiled__[alias].normalize =
          self.__compiled__[self.__schemas__[alias]].normalize;
      });

      //
      // Fake record for guessed links
      //
      self.__compiled__[''] = { validate: null, normalize: createNormalizer() };

      //
      // Build schema condition
      //
      var slist = Object.keys(self.__compiled__)
                          .filter(function (name) {
                            // Filter disabled & fake schemas
                            return name.length > 0 && self.__compiled__[name];
                          })
                          .map(escapeRE)
                          .join('|');
      // (?!_) cause 1.5x slowdown
      self.re.schema_test   = RegExp('(^|(?!_)(?:[><\uff5c]|' + re.src_ZPCc + '))(' + slist + ')', 'i');
      self.re.schema_search = RegExp('(^|(?!_)(?:[><\uff5c]|' + re.src_ZPCc + '))(' + slist + ')', 'ig');

      self.re.pretest = RegExp(
        '(' + self.re.schema_test.source + ')|(' + self.re.host_fuzzy_test.source + ')|@',
        'i'
      );

      //
      // Cleanup
      //

      resetScanCache(self);
    }

    /**
     * class Match
     *
     * Match result. Single element of array, returned by [[LinkifyIt#match]]
     **/
    function Match(self, shift) {
      var start = self.__index__,
          end   = self.__last_index__,
          text  = self.__text_cache__.slice(start, end);

      /**
       * Match#schema -> String
       *
       * Prefix (protocol) for matched string.
       **/
      this.schema    = self.__schema__.toLowerCase();
      /**
       * Match#index -> Number
       *
       * First position of matched string.
       **/
      this.index     = start + shift;
      /**
       * Match#lastIndex -> Number
       *
       * Next position after matched string.
       **/
      this.lastIndex = end + shift;
      /**
       * Match#raw -> String
       *
       * Matched string.
       **/
      this.raw       = text;
      /**
       * Match#text -> String
       *
       * Notmalized text of matched string.
       **/
      this.text      = text;
      /**
       * Match#url -> String
       *
       * Normalized url of matched string.
       **/
      this.url       = text;
    }

    function createMatch(self, shift) {
      var match = new Match(self, shift);

      self.__compiled__[match.schema].normalize(match, self);

      return match;
    }


    /**
     * class LinkifyIt
     **/

    /**
     * new LinkifyIt(schemas, options)
     * - schemas (Object): Optional. Additional schemas to validate (prefix/validator)
     * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
     *
     * Creates new linkifier instance with optional additional schemas.
     * Can be called without `new` keyword for convenience.
     *
     * By default understands:
     *
     * - `http(s)://...` , `ftp://...`, `mailto:...` & `//...` links
     * - "fuzzy" links and emails (example.com, foo@bar.com).
     *
     * `schemas` is an object, where each key/value describes protocol/rule:
     *
     * - __key__ - link prefix (usually, protocol name with `:` at the end, `skype:`
     *   for example). `linkify-it` makes shure that prefix is not preceeded with
     *   alphanumeric char and symbols. Only whitespaces and punctuation allowed.
     * - __value__ - rule to check tail after link prefix
     *   - _String_ - just alias to existing rule
     *   - _Object_
     *     - _validate_ - validator function (should return matched length on success),
     *       or `RegExp`.
     *     - _normalize_ - optional function to normalize text & url of matched result
     *       (for example, for @twitter mentions).
     *
     * `options`:
     *
     * - __fuzzyLink__ - recognige URL-s without `http(s):` prefix. Default `true`.
     * - __fuzzyIP__ - allow IPs in fuzzy links above. Can conflict with some texts
     *   like version numbers. Default `false`.
     * - __fuzzyEmail__ - recognize emails without `mailto:` prefix.
     *
     **/
    function LinkifyIt(schemas, options) {
      if (!(this instanceof LinkifyIt)) {
        return new LinkifyIt(schemas, options);
      }

      if (!options) {
        if (isOptionsObj(schemas)) {
          options = schemas;
          schemas = {};
        }
      }

      this.__opts__           = assign({}, defaultOptions, options);

      // Cache last tested result. Used to skip repeating steps on next `match` call.
      this.__index__          = -1;
      this.__last_index__     = -1; // Next scan position
      this.__schema__         = '';
      this.__text_cache__     = '';

      this.__schemas__        = assign({}, defaultSchemas, schemas);
      this.__compiled__       = {};

      this.__tlds__           = tlds_default;
      this.__tlds_replaced__  = false;

      this.re = {};

      compile(this);
    }


    /** chainable
     * LinkifyIt#add(schema, definition)
     * - schema (String): rule name (fixed pattern prefix)
     * - definition (String|RegExp|Object): schema definition
     *
     * Add new rule definition. See constructor description for details.
     **/
    LinkifyIt.prototype.add = function add(schema, definition) {
      this.__schemas__[schema] = definition;
      compile(this);
      return this;
    };


    /** chainable
     * LinkifyIt#set(options)
     * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
     *
     * Set recognition options for links without schema.
     **/
    LinkifyIt.prototype.set = function set(options) {
      this.__opts__ = assign(this.__opts__, options);
      return this;
    };


    /**
     * LinkifyIt#test(text) -> Boolean
     *
     * Searches linkifiable pattern and returns `true` on success or `false` on fail.
     **/
    LinkifyIt.prototype.test = function test(text) {
      // Reset scan cache
      this.__text_cache__ = text;
      this.__index__      = -1;

      if (!text.length) { return false; }

      var m, ml, me, len, shift, next, re, tld_pos, at_pos;

      // try to scan for link with schema - that's the most simple rule
      if (this.re.schema_test.test(text)) {
        re = this.re.schema_search;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
          len = this.testSchemaAt(text, m[2], re.lastIndex);
          if (len) {
            this.__schema__     = m[2];
            this.__index__      = m.index + m[1].length;
            this.__last_index__ = m.index + m[0].length + len;
            break;
          }
        }
      }

      if (this.__opts__.fuzzyLink && this.__compiled__['http:']) {
        // guess schemaless links
        tld_pos = text.search(this.re.host_fuzzy_test);
        if (tld_pos >= 0) {
          // if tld is located after found link - no need to check fuzzy pattern
          if (this.__index__ < 0 || tld_pos < this.__index__) {
            if ((ml = text.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy)) !== null) {

              shift = ml.index + ml[1].length;

              if (this.__index__ < 0 || shift < this.__index__) {
                this.__schema__     = '';
                this.__index__      = shift;
                this.__last_index__ = ml.index + ml[0].length;
              }
            }
          }
        }
      }

      if (this.__opts__.fuzzyEmail && this.__compiled__['mailto:']) {
        // guess schemaless emails
        at_pos = text.indexOf('@');
        if (at_pos >= 0) {
          // We can't skip this check, because this cases are possible:
          // 192.168.1.1@gmail.com, my.in@example.com
          if ((me = text.match(this.re.email_fuzzy)) !== null) {

            shift = me.index + me[1].length;
            next  = me.index + me[0].length;

            if (this.__index__ < 0 || shift < this.__index__ ||
                (shift === this.__index__ && next > this.__last_index__)) {
              this.__schema__     = 'mailto:';
              this.__index__      = shift;
              this.__last_index__ = next;
            }
          }
        }
      }

      return this.__index__ >= 0;
    };


    /**
     * LinkifyIt#pretest(text) -> Boolean
     *
     * Very quick check, that can give false positives. Returns true if link MAY BE
     * can exists. Can be used for speed optimization, when you need to check that
     * link NOT exists.
     **/
    LinkifyIt.prototype.pretest = function pretest(text) {
      return this.re.pretest.test(text);
    };


    /**
     * LinkifyIt#testSchemaAt(text, name, position) -> Number
     * - text (String): text to scan
     * - name (String): rule (schema) name
     * - position (Number): text offset to check from
     *
     * Similar to [[LinkifyIt#test]] but checks only specific protocol tail exactly
     * at given position. Returns length of found pattern (0 on fail).
     **/
    LinkifyIt.prototype.testSchemaAt = function testSchemaAt(text, schema, pos) {
      // If not supported schema check requested - terminate
      if (!this.__compiled__[schema.toLowerCase()]) {
        return 0;
      }
      return this.__compiled__[schema.toLowerCase()].validate(text, pos, this);
    };


    /**
     * LinkifyIt#match(text) -> Array|null
     *
     * Returns array of found link descriptions or `null` on fail. We strongly
     * recommend to use [[LinkifyIt#test]] first, for best speed.
     *
     * ##### Result match description
     *
     * - __schema__ - link schema, can be empty for fuzzy links, or `//` for
     *   protocol-neutral  links.
     * - __index__ - offset of matched text
     * - __lastIndex__ - index of next char after mathch end
     * - __raw__ - matched text
     * - __text__ - normalized text
     * - __url__ - link, generated from matched text
     **/
    LinkifyIt.prototype.match = function match(text) {
      var shift = 0, result = [];

      // Try to take previous element from cache, if .test() called before
      if (this.__index__ >= 0 && this.__text_cache__ === text) {
        result.push(createMatch(this, shift));
        shift = this.__last_index__;
      }

      // Cut head if cache was used
      var tail = shift ? text.slice(shift) : text;

      // Scan string until end reached
      while (this.test(tail)) {
        result.push(createMatch(this, shift));

        tail = tail.slice(this.__last_index__);
        shift += this.__last_index__;
      }

      if (result.length) {
        return result;
      }

      return null;
    };


    /** chainable
     * LinkifyIt#tlds(list [, keepOld]) -> this
     * - list (Array): list of tlds
     * - keepOld (Boolean): merge with current list if `true` (`false` by default)
     *
     * Load (or merge) new tlds list. Those are user for fuzzy links (without prefix)
     * to avoid false positives. By default this algorythm used:
     *
     * - hostname with any 2-letter root zones are ok.
     * - biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф
     *   are ok.
     * - encoded (`xn--...`) root zones are ok.
     *
     * If list is replaced, then exact match for 2-chars root zones will be checked.
     **/
    LinkifyIt.prototype.tlds = function tlds(list, keepOld) {
      list = Array.isArray(list) ? list : [ list ];

      if (!keepOld) {
        this.__tlds__ = list.slice();
        this.__tlds_replaced__ = true;
        compile(this);
        return this;
      }

      this.__tlds__ = this.__tlds__.concat(list)
                                      .sort()
                                      .filter(function (el, idx, arr) {
                                        return el !== arr[idx - 1];
                                      })
                                      .reverse();

      compile(this);
      return this;
    };

    /**
     * LinkifyIt#normalize(match)
     *
     * Default normalizer (if schema does not define it's own).
     **/
    LinkifyIt.prototype.normalize = function normalize(match) {

      // Do minimal possible changes by default. Need to collect feedback prior
      // to move forward https://github.com/markdown-it/linkify-it/issues/1

      if (!match.schema) { match.url = 'http://' + match.url; }

      if (match.schema === 'mailto:' && !/^mailto:/i.test(match.url)) {
        match.url = 'mailto:' + match.url;
      }
    };


    /**
     * LinkifyIt#onCompile()
     *
     * Override to modify basic RegExp-s.
     **/
    LinkifyIt.prototype.onCompile = function onCompile() {
    };


    module.exports = LinkifyIt;

    },{"./lib/re":54}],54:[function(require,module,exports){


    module.exports = function (opts) {
      var re = {};

      // Use direct extract instead of `regenerate` to reduse browserified size
      re.src_Any = require('uc.micro/properties/Any/regex').source;
      re.src_Cc  = require('uc.micro/categories/Cc/regex').source;
      re.src_Z   = require('uc.micro/categories/Z/regex').source;
      re.src_P   = require('uc.micro/categories/P/regex').source;

      // \p{\Z\P\Cc\CF} (white spaces + control + format + punctuation)
      re.src_ZPCc = [ re.src_Z, re.src_P, re.src_Cc ].join('|');

      // \p{\Z\Cc} (white spaces + control)
      re.src_ZCc = [ re.src_Z, re.src_Cc ].join('|');

      // Experimental. List of chars, completely prohibited in links
      // because can separate it from other part of text
      var text_separators = '[><\uff5c]';

      // All possible word characters (everything without punctuation, spaces & controls)
      // Defined via punctuation & spaces to save space
      // Should be something like \p{\L\N\S\M} (\w but without `_`)
      re.src_pseudo_letter       = '(?:(?!' + text_separators + '|' + re.src_ZPCc + ')' + re.src_Any + ')';
      // The same as abothe but without [0-9]
      // var src_pseudo_letter_non_d = '(?:(?![0-9]|' + src_ZPCc + ')' + src_Any + ')';

      ////////////////////////////////////////////////////////////////////////////////

      re.src_ip4 =

        '(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';

      // Prohibit any of "@/[]()" in user/pass to avoid wrong domain fetch.
      re.src_auth    = '(?:(?:(?!' + re.src_ZCc + '|[@/\\[\\]()]).)+@)?';

      re.src_port =

        '(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?';

      re.src_host_terminator =

        '(?=$|' + text_separators + '|' + re.src_ZPCc + ')(?!-|_|:\\d|\\.-|\\.(?!$|' + re.src_ZPCc + '))';

      re.src_path =

        '(?:' +
          '[/?#]' +
            '(?:' +
              '(?!' + re.src_ZCc + '|' + text_separators + '|[()[\\]{}.,"\'?!\\-]).|' +
              '\\[(?:(?!' + re.src_ZCc + '|\\]).)*\\]|' +
              '\\((?:(?!' + re.src_ZCc + '|[)]).)*\\)|' +
              '\\{(?:(?!' + re.src_ZCc + '|[}]).)*\\}|' +
              '\\"(?:(?!' + re.src_ZCc + '|["]).)+\\"|' +
              "\\'(?:(?!" + re.src_ZCc + "|[']).)+\\'|" +
              "\\'(?=" + re.src_pseudo_letter + '|[-]).|' +  // allow `I'm_king` if no pair found
              '\\.{2,4}[a-zA-Z0-9%/]|' + // github has ... in commit range links,
                                         // google has .... in links (issue #66)
                                         // Restrict to
                                         // - english
                                         // - percent-encoded
                                         // - parts of file path
                                         // until more examples found.
              '\\.(?!' + re.src_ZCc + '|[.]).|' +
              (opts && opts['---'] ?
                '\\-(?!--(?:[^-]|$))(?:-*)|' // `---` => long dash, terminate
                :
                '\\-+|'
              ) +
              '\\,(?!' + re.src_ZCc + ').|' +      // allow `,,,` in paths
              '\\!(?!' + re.src_ZCc + '|[!]).|' +
              '\\?(?!' + re.src_ZCc + '|[?]).' +
            ')+' +
          '|\\/' +
        ')?';

      // Allow anything in markdown spec, forbid quote (") at the first position
      // because emails enclosed in quotes are far more common
      re.src_email_name =

        '[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]*';

      re.src_xn =

        'xn--[a-z0-9\\-]{1,59}';

      // More to read about domain names
      // http://serverfault.com/questions/638260/

      re.src_domain_root =

        // Allow letters & digits (http://test1)
        '(?:' +
          re.src_xn +
          '|' +
          re.src_pseudo_letter + '{1,63}' +
        ')';

      re.src_domain =

        '(?:' +
          re.src_xn +
          '|' +
          '(?:' + re.src_pseudo_letter + ')' +
          '|' +
          '(?:' + re.src_pseudo_letter + '(?:-|' + re.src_pseudo_letter + '){0,61}' + re.src_pseudo_letter + ')' +
        ')';

      re.src_host =

        '(?:' +
        // Don't need IP check, because digits are already allowed in normal domain names
        //   src_ip4 +
        // '|' +
          '(?:(?:(?:' + re.src_domain + ')\\.)*' + re.src_domain/*_root*/ + ')' +
        ')';

      re.tpl_host_fuzzy =

        '(?:' +
          re.src_ip4 +
        '|' +
          '(?:(?:(?:' + re.src_domain + ')\\.)+(?:%TLDS%))' +
        ')';

      re.tpl_host_no_ip_fuzzy =

        '(?:(?:(?:' + re.src_domain + ')\\.)+(?:%TLDS%))';

      re.src_host_strict =

        re.src_host + re.src_host_terminator;

      re.tpl_host_fuzzy_strict =

        re.tpl_host_fuzzy + re.src_host_terminator;

      re.src_host_port_strict =

        re.src_host + re.src_port + re.src_host_terminator;

      re.tpl_host_port_fuzzy_strict =

        re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;

      re.tpl_host_port_no_ip_fuzzy_strict =

        re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator;


      ////////////////////////////////////////////////////////////////////////////////
      // Main rules

      // Rude test fuzzy links by host, for quick deny
      re.tpl_host_fuzzy_test =

        'localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:' + re.src_ZPCc + '|>|$))';

      re.tpl_email_fuzzy =

          '(^|' + text_separators + '|"|\\(|' + re.src_ZCc + ')' +
          '(' + re.src_email_name + '@' + re.tpl_host_fuzzy_strict + ')';

      re.tpl_link_fuzzy =
          // Fuzzy link can't be prepended with .:/\- and non punctuation.
          // but can start with > (markdown blockquote)
          '(^|(?![.:/\\-_@])(?:[$+<=>^`|\uff5c]|' + re.src_ZPCc + '))' +
          '((?![$+<=>^`|\uff5c])' + re.tpl_host_port_fuzzy_strict + re.src_path + ')';

      re.tpl_link_no_ip_fuzzy =
          // Fuzzy link can't be prepended with .:/\- and non punctuation.
          // but can start with > (markdown blockquote)
          '(^|(?![.:/\\-_@])(?:[$+<=>^`|\uff5c]|' + re.src_ZPCc + '))' +
          '((?![$+<=>^`|\uff5c])' + re.tpl_host_port_no_ip_fuzzy_strict + re.src_path + ')';

      return re;
    };

    },{"uc.micro/categories/Cc/regex":61,"uc.micro/categories/P/regex":63,"uc.micro/categories/Z/regex":64,"uc.micro/properties/Any/regex":66}],55:[function(require,module,exports){


    /* eslint-disable no-bitwise */

    var decodeCache = {};

    function getDecodeCache(exclude) {
      var i, ch, cache = decodeCache[exclude];
      if (cache) { return cache; }

      cache = decodeCache[exclude] = [];

      for (i = 0; i < 128; i++) {
        ch = String.fromCharCode(i);
        cache.push(ch);
      }

      for (i = 0; i < exclude.length; i++) {
        ch = exclude.charCodeAt(i);
        cache[ch] = '%' + ('0' + ch.toString(16).toUpperCase()).slice(-2);
      }

      return cache;
    }


    // Decode percent-encoded string.
    //
    function decode(string, exclude) {
      var cache;

      if (typeof exclude !== 'string') {
        exclude = decode.defaultChars;
      }

      cache = getDecodeCache(exclude);

      return string.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
        var i, l, b1, b2, b3, b4, chr,
            result = '';

        for (i = 0, l = seq.length; i < l; i += 3) {
          b1 = parseInt(seq.slice(i + 1, i + 3), 16);

          if (b1 < 0x80) {
            result += cache[b1];
            continue;
          }

          if ((b1 & 0xE0) === 0xC0 && (i + 3 < l)) {
            // 110xxxxx 10xxxxxx
            b2 = parseInt(seq.slice(i + 4, i + 6), 16);

            if ((b2 & 0xC0) === 0x80) {
              chr = ((b1 << 6) & 0x7C0) | (b2 & 0x3F);

              if (chr < 0x80) {
                result += '\ufffd\ufffd';
              } else {
                result += String.fromCharCode(chr);
              }

              i += 3;
              continue;
            }
          }

          if ((b1 & 0xF0) === 0xE0 && (i + 6 < l)) {
            // 1110xxxx 10xxxxxx 10xxxxxx
            b2 = parseInt(seq.slice(i + 4, i + 6), 16);
            b3 = parseInt(seq.slice(i + 7, i + 9), 16);

            if ((b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
              chr = ((b1 << 12) & 0xF000) | ((b2 << 6) & 0xFC0) | (b3 & 0x3F);

              if (chr < 0x800 || (chr >= 0xD800 && chr <= 0xDFFF)) {
                result += '\ufffd\ufffd\ufffd';
              } else {
                result += String.fromCharCode(chr);
              }

              i += 6;
              continue;
            }
          }

          if ((b1 & 0xF8) === 0xF0 && (i + 9 < l)) {
            // 111110xx 10xxxxxx 10xxxxxx 10xxxxxx
            b2 = parseInt(seq.slice(i + 4, i + 6), 16);
            b3 = parseInt(seq.slice(i + 7, i + 9), 16);
            b4 = parseInt(seq.slice(i + 10, i + 12), 16);

            if ((b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80 && (b4 & 0xC0) === 0x80) {
              chr = ((b1 << 18) & 0x1C0000) | ((b2 << 12) & 0x3F000) | ((b3 << 6) & 0xFC0) | (b4 & 0x3F);

              if (chr < 0x10000 || chr > 0x10FFFF) {
                result += '\ufffd\ufffd\ufffd\ufffd';
              } else {
                chr -= 0x10000;
                result += String.fromCharCode(0xD800 + (chr >> 10), 0xDC00 + (chr & 0x3FF));
              }

              i += 9;
              continue;
            }
          }

          result += '\ufffd';
        }

        return result;
      });
    }


    decode.defaultChars   = ';/?:@&=+$,#';
    decode.componentChars = '';


    module.exports = decode;

    },{}],56:[function(require,module,exports){


    var encodeCache = {};


    // Create a lookup array where anything but characters in `chars` string
    // and alphanumeric chars is percent-encoded.
    //
    function getEncodeCache(exclude) {
      var i, ch, cache = encodeCache[exclude];
      if (cache) { return cache; }

      cache = encodeCache[exclude] = [];

      for (i = 0; i < 128; i++) {
        ch = String.fromCharCode(i);

        if (/^[0-9a-z]$/i.test(ch)) {
          // always allow unencoded alphanumeric characters
          cache.push(ch);
        } else {
          cache.push('%' + ('0' + i.toString(16).toUpperCase()).slice(-2));
        }
      }

      for (i = 0; i < exclude.length; i++) {
        cache[exclude.charCodeAt(i)] = exclude[i];
      }

      return cache;
    }


    // Encode unsafe characters with percent-encoding, skipping already
    // encoded sequences.
    //
    //  - string       - string to encode
    //  - exclude      - list of characters to ignore (in addition to a-zA-Z0-9)
    //  - keepEscaped  - don't encode '%' in a correct escape sequence (default: true)
    //
    function encode(string, exclude, keepEscaped) {
      var i, l, code, nextCode, cache,
          result = '';

      if (typeof exclude !== 'string') {
        // encode(string, keepEscaped)
        keepEscaped  = exclude;
        exclude = encode.defaultChars;
      }

      if (typeof keepEscaped === 'undefined') {
        keepEscaped = true;
      }

      cache = getEncodeCache(exclude);

      for (i = 0, l = string.length; i < l; i++) {
        code = string.charCodeAt(i);

        if (keepEscaped && code === 0x25 /* % */ && i + 2 < l) {
          if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
            result += string.slice(i, i + 3);
            i += 2;
            continue;
          }
        }

        if (code < 128) {
          result += cache[code];
          continue;
        }

        if (code >= 0xD800 && code <= 0xDFFF) {
          if (code >= 0xD800 && code <= 0xDBFF && i + 1 < l) {
            nextCode = string.charCodeAt(i + 1);
            if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
              result += encodeURIComponent(string[i] + string[i + 1]);
              i++;
              continue;
            }
          }
          result += '%EF%BF%BD';
          continue;
        }

        result += encodeURIComponent(string[i]);
      }

      return result;
    }

    encode.defaultChars   = ";/?:@&=+$,-_.!~*'()#";
    encode.componentChars = "-_.!~*'()";


    module.exports = encode;

    },{}],57:[function(require,module,exports){


    module.exports = function format(url) {
      var result = '';

      result += url.protocol || '';
      result += url.slashes ? '//' : '';
      result += url.auth ? url.auth + '@' : '';

      if (url.hostname && url.hostname.indexOf(':') !== -1) {
        // ipv6 address
        result += '[' + url.hostname + ']';
      } else {
        result += url.hostname || '';
      }

      result += url.port ? ':' + url.port : '';
      result += url.pathname || '';
      result += url.search || '';
      result += url.hash || '';

      return result;
    };

    },{}],58:[function(require,module,exports){


    module.exports.encode = require('./encode');
    module.exports.decode = require('./decode');
    module.exports.format = require('./format');
    module.exports.parse  = require('./parse');

    },{"./decode":55,"./encode":56,"./format":57,"./parse":59}],59:[function(require,module,exports){

    //
    // Changes from joyent/node:
    //
    // 1. No leading slash in paths,
    //    e.g. in `url.parse('http://foo?bar')` pathname is ``, not `/`
    //
    // 2. Backslashes are not replaced with slashes,
    //    so `http:\\example.org\` is treated like a relative path
    //
    // 3. Trailing colon is treated like a part of the path,
    //    i.e. in `http://example.org:foo` pathname is `:foo`
    //
    // 4. Nothing is URL-encoded in the resulting object,
    //    (in joyent/node some chars in auth and paths are encoded)
    //
    // 5. `url.parse()` does not have `parseQueryString` argument
    //
    // 6. Removed extraneous result properties: `host`, `path`, `query`, etc.,
    //    which can be constructed using other parts of the url.
    //


    function Url() {
      this.protocol = null;
      this.slashes = null;
      this.auth = null;
      this.port = null;
      this.hostname = null;
      this.hash = null;
      this.search = null;
      this.pathname = null;
    }

    // Reference: RFC 3986, RFC 1808, RFC 2396

    // define these here so at least they only have to be
    // compiled once on the first module load.
    var protocolPattern = /^([a-z0-9.+-]+:)/i,
        portPattern = /:[0-9]*$/,

        // Special case for a simple path URL
        simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

        // RFC 2396: characters reserved for delimiting URLs.
        // We actually just auto-escape these.
        delims = [ '<', '>', '"', '`', ' ', '\r', '\n', '\t' ],

        // RFC 2396: characters not allowed for various reasons.
        unwise = [ '{', '}', '|', '\\', '^', '`' ].concat(delims),

        // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
        autoEscape = [ '\'' ].concat(unwise),
        // Characters that are never ever allowed in a hostname.
        // Note that any invalid chars are also handled, but these
        // are the ones that are *expected* to be seen, so we fast-path
        // them.
        nonHostChars = [ '%', '/', '?', ';', '#' ].concat(autoEscape),
        hostEndingChars = [ '/', '?', '#' ],
        hostnameMaxLen = 255,
        hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
        hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
        // protocols that can allow "unsafe" and "unwise" chars.
        /* eslint-disable no-script-url */
        // protocols that never have a hostname.
        hostlessProtocol = {
          'javascript': true,
          'javascript:': true
        },
        // protocols that always contain a // bit.
        slashedProtocol = {
          'http': true,
          'https': true,
          'ftp': true,
          'gopher': true,
          'file': true,
          'http:': true,
          'https:': true,
          'ftp:': true,
          'gopher:': true,
          'file:': true
        };
        /* eslint-enable no-script-url */

    function urlParse(url, slashesDenoteHost) {
      if (url && url instanceof Url) { return url; }

      var u = new Url();
      u.parse(url, slashesDenoteHost);
      return u;
    }

    Url.prototype.parse = function(url, slashesDenoteHost) {
      var i, l, lowerProto, hec, slashes,
          rest = url;

      // trim before proceeding.
      // This is to support parse stuff like "  http://foo.com  \n"
      rest = rest.trim();

      if (!slashesDenoteHost && url.split('#').length === 1) {
        // Try fast path regexp
        var simplePath = simplePathPattern.exec(rest);
        if (simplePath) {
          this.pathname = simplePath[1];
          if (simplePath[2]) {
            this.search = simplePath[2];
          }
          return this;
        }
      }

      var proto = protocolPattern.exec(rest);
      if (proto) {
        proto = proto[0];
        lowerProto = proto.toLowerCase();
        this.protocol = proto;
        rest = rest.substr(proto.length);
      }

      // figure out if it's got a host
      // user@server is *always* interpreted as a hostname, and url
      // resolution will treat //foo/bar as host=foo,path=bar because that's
      // how the browser resolves relative URLs.
      if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
        slashes = rest.substr(0, 2) === '//';
        if (slashes && !(proto && hostlessProtocol[proto])) {
          rest = rest.substr(2);
          this.slashes = true;
        }
      }

      if (!hostlessProtocol[proto] &&
          (slashes || (proto && !slashedProtocol[proto]))) {

        // there's a hostname.
        // the first instance of /, ?, ;, or # ends the host.
        //
        // If there is an @ in the hostname, then non-host chars *are* allowed
        // to the left of the last @ sign, unless some host-ending character
        // comes *before* the @-sign.
        // URLs are obnoxious.
        //
        // ex:
        // http://a@b@c/ => user:a@b host:c
        // http://a@b?@c => user:a host:c path:/?@c

        // v0.12 TODO(isaacs): This is not quite how Chrome does things.
        // Review our test case against browsers more comprehensively.

        // find the first instance of any hostEndingChars
        var hostEnd = -1;
        for (i = 0; i < hostEndingChars.length; i++) {
          hec = rest.indexOf(hostEndingChars[i]);
          if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
            hostEnd = hec;
          }
        }

        // at this point, either we have an explicit point where the
        // auth portion cannot go past, or the last @ char is the decider.
        var auth, atSign;
        if (hostEnd === -1) {
          // atSign can be anywhere.
          atSign = rest.lastIndexOf('@');
        } else {
          // atSign must be in auth portion.
          // http://a@b/c@d => host:b auth:a path:/c@d
          atSign = rest.lastIndexOf('@', hostEnd);
        }

        // Now we have a portion which is definitely the auth.
        // Pull that off.
        if (atSign !== -1) {
          auth = rest.slice(0, atSign);
          rest = rest.slice(atSign + 1);
          this.auth = auth;
        }

        // the host is the remaining to the left of the first non-host char
        hostEnd = -1;
        for (i = 0; i < nonHostChars.length; i++) {
          hec = rest.indexOf(nonHostChars[i]);
          if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
            hostEnd = hec;
          }
        }
        // if we still have not hit it, then the entire thing is a host.
        if (hostEnd === -1) {
          hostEnd = rest.length;
        }

        if (rest[hostEnd - 1] === ':') { hostEnd--; }
        var host = rest.slice(0, hostEnd);
        rest = rest.slice(hostEnd);

        // pull out port.
        this.parseHost(host);

        // we've indicated that there is a hostname,
        // so even if it's empty, it has to be present.
        this.hostname = this.hostname || '';

        // if hostname begins with [ and ends with ]
        // assume that it's an IPv6 address.
        var ipv6Hostname = this.hostname[0] === '[' &&
            this.hostname[this.hostname.length - 1] === ']';

        // validate a little.
        if (!ipv6Hostname) {
          var hostparts = this.hostname.split(/\./);
          for (i = 0, l = hostparts.length; i < l; i++) {
            var part = hostparts[i];
            if (!part) { continue; }
            if (!part.match(hostnamePartPattern)) {
              var newpart = '';
              for (var j = 0, k = part.length; j < k; j++) {
                if (part.charCodeAt(j) > 127) {
                  // we replace non-ASCII char with a temporary placeholder
                  // we need this to make sure size of hostname is not
                  // broken by replacing non-ASCII by nothing
                  newpart += 'x';
                } else {
                  newpart += part[j];
                }
              }
              // we test again with ASCII char only
              if (!newpart.match(hostnamePartPattern)) {
                var validParts = hostparts.slice(0, i);
                var notHost = hostparts.slice(i + 1);
                var bit = part.match(hostnamePartStart);
                if (bit) {
                  validParts.push(bit[1]);
                  notHost.unshift(bit[2]);
                }
                if (notHost.length) {
                  rest = notHost.join('.') + rest;
                }
                this.hostname = validParts.join('.');
                break;
              }
            }
          }
        }

        if (this.hostname.length > hostnameMaxLen) {
          this.hostname = '';
        }

        // strip [ and ] from the hostname
        // the host field still retains them, though
        if (ipv6Hostname) {
          this.hostname = this.hostname.substr(1, this.hostname.length - 2);
        }
      }

      // chop off from the tail first.
      var hash = rest.indexOf('#');
      if (hash !== -1) {
        // got a fragment string.
        this.hash = rest.substr(hash);
        rest = rest.slice(0, hash);
      }
      var qm = rest.indexOf('?');
      if (qm !== -1) {
        this.search = rest.substr(qm);
        rest = rest.slice(0, qm);
      }
      if (rest) { this.pathname = rest; }
      if (slashedProtocol[lowerProto] &&
          this.hostname && !this.pathname) {
        this.pathname = '';
      }

      return this;
    };

    Url.prototype.parseHost = function(host) {
      var port = portPattern.exec(host);
      if (port) {
        port = port[0];
        if (port !== ':') {
          this.port = port.substr(1);
        }
        host = host.substr(0, host.length - port.length);
      }
      if (host) { this.hostname = host; }
    };

    module.exports = urlParse;

    },{}],60:[function(require,module,exports){
    (function (global){
    (function(root) {

    	/** Detect free variables */
    	var freeExports = typeof exports == 'object' && exports &&
    		!exports.nodeType && exports;
    	var freeModule = typeof module == 'object' && module &&
    		!module.nodeType && module;
    	var freeGlobal = typeof global == 'object' && global;
    	if (
    		freeGlobal.global === freeGlobal ||
    		freeGlobal.window === freeGlobal ||
    		freeGlobal.self === freeGlobal
    	) {
    		root = freeGlobal;
    	}

    	/**
    	 * The `punycode` object.
    	 * @name punycode
    	 * @type Object
    	 */
    	var punycode,

    	/** Highest positive signed 32-bit float value */
    	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

    	/** Bootstring parameters */
    	base = 36,
    	tMin = 1,
    	tMax = 26,
    	skew = 38,
    	damp = 700,
    	initialBias = 72,
    	initialN = 128, // 0x80
    	delimiter = '-', // '\x2D'

    	/** Regular expressions */
    	regexPunycode = /^xn--/,
    	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
    	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

    	/** Error messages */
    	errors = {
    		'overflow': 'Overflow: input needs wider integers to process',
    		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
    		'invalid-input': 'Invalid input'
    	},

    	/** Convenience shortcuts */
    	baseMinusTMin = base - tMin,
    	floor = Math.floor,
    	stringFromCharCode = String.fromCharCode,

    	/** Temporary variable */
    	key;

    	/*--------------------------------------------------------------------------*/

    	/**
    	 * A generic error utility function.
    	 * @private
    	 * @param {String} type The error type.
    	 * @returns {Error} Throws a `RangeError` with the applicable error message.
    	 */
    	function error(type) {
    		throw new RangeError(errors[type]);
    	}

    	/**
    	 * A generic `Array#map` utility function.
    	 * @private
    	 * @param {Array} array The array to iterate over.
    	 * @param {Function} callback The function that gets called for every array
    	 * item.
    	 * @returns {Array} A new array of values returned by the callback function.
    	 */
    	function map(array, fn) {
    		var length = array.length;
    		var result = [];
    		while (length--) {
    			result[length] = fn(array[length]);
    		}
    		return result;
    	}

    	/**
    	 * A simple `Array#map`-like wrapper to work with domain name strings or email
    	 * addresses.
    	 * @private
    	 * @param {String} domain The domain name or email address.
    	 * @param {Function} callback The function that gets called for every
    	 * character.
    	 * @returns {Array} A new string of characters returned by the callback
    	 * function.
    	 */
    	function mapDomain(string, fn) {
    		var parts = string.split('@');
    		var result = '';
    		if (parts.length > 1) {
    			// In email addresses, only the domain name should be punycoded. Leave
    			// the local part (i.e. everything up to `@`) intact.
    			result = parts[0] + '@';
    			string = parts[1];
    		}
    		// Avoid `split(regex)` for IE8 compatibility. See #17.
    		string = string.replace(regexSeparators, '\x2E');
    		var labels = string.split('.');
    		var encoded = map(labels, fn).join('.');
    		return result + encoded;
    	}

    	/**
    	 * Creates an array containing the numeric code points of each Unicode
    	 * character in the string. While JavaScript uses UCS-2 internally,
    	 * this function will convert a pair of surrogate halves (each of which
    	 * UCS-2 exposes as separate characters) into a single code point,
    	 * matching UTF-16.
    	 * @see `punycode.ucs2.encode`
    	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
    	 * @memberOf punycode.ucs2
    	 * @name decode
    	 * @param {String} string The Unicode input string (UCS-2).
    	 * @returns {Array} The new array of code points.
    	 */
    	function ucs2decode(string) {
    		var output = [],
    		    counter = 0,
    		    length = string.length,
    		    value,
    		    extra;
    		while (counter < length) {
    			value = string.charCodeAt(counter++);
    			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
    				// high surrogate, and there is a next character
    				extra = string.charCodeAt(counter++);
    				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
    					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
    				} else {
    					// unmatched surrogate; only append this code unit, in case the next
    					// code unit is the high surrogate of a surrogate pair
    					output.push(value);
    					counter--;
    				}
    			} else {
    				output.push(value);
    			}
    		}
    		return output;
    	}

    	/**
    	 * Creates a string based on an array of numeric code points.
    	 * @see `punycode.ucs2.decode`
    	 * @memberOf punycode.ucs2
    	 * @name encode
    	 * @param {Array} codePoints The array of numeric code points.
    	 * @returns {String} The new Unicode string (UCS-2).
    	 */
    	function ucs2encode(array) {
    		return map(array, function(value) {
    			var output = '';
    			if (value > 0xFFFF) {
    				value -= 0x10000;
    				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
    				value = 0xDC00 | value & 0x3FF;
    			}
    			output += stringFromCharCode(value);
    			return output;
    		}).join('');
    	}

    	/**
    	 * Converts a basic code point into a digit/integer.
    	 * @see `digitToBasic()`
    	 * @private
    	 * @param {Number} codePoint The basic numeric code point value.
    	 * @returns {Number} The numeric value of a basic code point (for use in
    	 * representing integers) in the range `0` to `base - 1`, or `base` if
    	 * the code point does not represent a value.
    	 */
    	function basicToDigit(codePoint) {
    		if (codePoint - 48 < 10) {
    			return codePoint - 22;
    		}
    		if (codePoint - 65 < 26) {
    			return codePoint - 65;
    		}
    		if (codePoint - 97 < 26) {
    			return codePoint - 97;
    		}
    		return base;
    	}

    	/**
    	 * Converts a digit/integer into a basic code point.
    	 * @see `basicToDigit()`
    	 * @private
    	 * @param {Number} digit The numeric value of a basic code point.
    	 * @returns {Number} The basic code point whose value (when used for
    	 * representing integers) is `digit`, which needs to be in the range
    	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
    	 * used; else, the lowercase form is used. The behavior is undefined
    	 * if `flag` is non-zero and `digit` has no uppercase form.
    	 */
    	function digitToBasic(digit, flag) {
    		//  0..25 map to ASCII a..z or A..Z
    		// 26..35 map to ASCII 0..9
    		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
    	}

    	/**
    	 * Bias adaptation function as per section 3.4 of RFC 3492.
    	 * https://tools.ietf.org/html/rfc3492#section-3.4
    	 * @private
    	 */
    	function adapt(delta, numPoints, firstTime) {
    		var k = 0;
    		delta = firstTime ? floor(delta / damp) : delta >> 1;
    		delta += floor(delta / numPoints);
    		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
    			delta = floor(delta / baseMinusTMin);
    		}
    		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
    	}

    	/**
    	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
    	 * symbols.
    	 * @memberOf punycode
    	 * @param {String} input The Punycode string of ASCII-only symbols.
    	 * @returns {String} The resulting string of Unicode symbols.
    	 */
    	function decode(input) {
    		// Don't use UCS-2
    		var output = [],
    		    inputLength = input.length,
    		    out,
    		    i = 0,
    		    n = initialN,
    		    bias = initialBias,
    		    basic,
    		    j,
    		    index,
    		    oldi,
    		    w,
    		    k,
    		    digit,
    		    t,
    		    /** Cached calculation results */
    		    baseMinusT;

    		// Handle the basic code points: let `basic` be the number of input code
    		// points before the last delimiter, or `0` if there is none, then copy
    		// the first basic code points to the output.

    		basic = input.lastIndexOf(delimiter);
    		if (basic < 0) {
    			basic = 0;
    		}

    		for (j = 0; j < basic; ++j) {
    			// if it's not a basic code point
    			if (input.charCodeAt(j) >= 0x80) {
    				error('not-basic');
    			}
    			output.push(input.charCodeAt(j));
    		}

    		// Main decoding loop: start just after the last delimiter if any basic code
    		// points were copied; start at the beginning otherwise.

    		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

    			// `index` is the index of the next character to be consumed.
    			// Decode a generalized variable-length integer into `delta`,
    			// which gets added to `i`. The overflow checking is easier
    			// if we increase `i` as we go, then subtract off its starting
    			// value at the end to obtain `delta`.
    			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

    				if (index >= inputLength) {
    					error('invalid-input');
    				}

    				digit = basicToDigit(input.charCodeAt(index++));

    				if (digit >= base || digit > floor((maxInt - i) / w)) {
    					error('overflow');
    				}

    				i += digit * w;
    				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

    				if (digit < t) {
    					break;
    				}

    				baseMinusT = base - t;
    				if (w > floor(maxInt / baseMinusT)) {
    					error('overflow');
    				}

    				w *= baseMinusT;

    			}

    			out = output.length + 1;
    			bias = adapt(i - oldi, out, oldi == 0);

    			// `i` was supposed to wrap around from `out` to `0`,
    			// incrementing `n` each time, so we'll fix that now:
    			if (floor(i / out) > maxInt - n) {
    				error('overflow');
    			}

    			n += floor(i / out);
    			i %= out;

    			// Insert `n` at position `i` of the output
    			output.splice(i++, 0, n);

    		}

    		return ucs2encode(output);
    	}

    	/**
    	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
    	 * Punycode string of ASCII-only symbols.
    	 * @memberOf punycode
    	 * @param {String} input The string of Unicode symbols.
    	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
    	 */
    	function encode(input) {
    		var n,
    		    delta,
    		    handledCPCount,
    		    basicLength,
    		    bias,
    		    j,
    		    m,
    		    q,
    		    k,
    		    t,
    		    currentValue,
    		    output = [],
    		    /** `inputLength` will hold the number of code points in `input`. */
    		    inputLength,
    		    /** Cached calculation results */
    		    handledCPCountPlusOne,
    		    baseMinusT,
    		    qMinusT;

    		// Convert the input in UCS-2 to Unicode
    		input = ucs2decode(input);

    		// Cache the length
    		inputLength = input.length;

    		// Initialize the state
    		n = initialN;
    		delta = 0;
    		bias = initialBias;

    		// Handle the basic code points
    		for (j = 0; j < inputLength; ++j) {
    			currentValue = input[j];
    			if (currentValue < 0x80) {
    				output.push(stringFromCharCode(currentValue));
    			}
    		}

    		handledCPCount = basicLength = output.length;

    		// `handledCPCount` is the number of code points that have been handled;
    		// `basicLength` is the number of basic code points.

    		// Finish the basic string - if it is not empty - with a delimiter
    		if (basicLength) {
    			output.push(delimiter);
    		}

    		// Main encoding loop:
    		while (handledCPCount < inputLength) {

    			// All non-basic code points < n have been handled already. Find the next
    			// larger one:
    			for (m = maxInt, j = 0; j < inputLength; ++j) {
    				currentValue = input[j];
    				if (currentValue >= n && currentValue < m) {
    					m = currentValue;
    				}
    			}

    			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
    			// but guard against overflow
    			handledCPCountPlusOne = handledCPCount + 1;
    			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
    				error('overflow');
    			}

    			delta += (m - n) * handledCPCountPlusOne;
    			n = m;

    			for (j = 0; j < inputLength; ++j) {
    				currentValue = input[j];

    				if (currentValue < n && ++delta > maxInt) {
    					error('overflow');
    				}

    				if (currentValue == n) {
    					// Represent delta as a generalized variable-length integer
    					for (q = delta, k = base; /* no condition */; k += base) {
    						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
    						if (q < t) {
    							break;
    						}
    						qMinusT = q - t;
    						baseMinusT = base - t;
    						output.push(
    							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
    						);
    						q = floor(qMinusT / baseMinusT);
    					}

    					output.push(stringFromCharCode(digitToBasic(q, 0)));
    					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
    					delta = 0;
    					++handledCPCount;
    				}
    			}

    			++delta;
    			++n;

    		}
    		return output.join('');
    	}

    	/**
    	 * Converts a Punycode string representing a domain name or an email address
    	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
    	 * it doesn't matter if you call it on a string that has already been
    	 * converted to Unicode.
    	 * @memberOf punycode
    	 * @param {String} input The Punycoded domain name or email address to
    	 * convert to Unicode.
    	 * @returns {String} The Unicode representation of the given Punycode
    	 * string.
    	 */
    	function toUnicode(input) {
    		return mapDomain(input, function(string) {
    			return regexPunycode.test(string)
    				? decode(string.slice(4).toLowerCase())
    				: string;
    		});
    	}

    	/**
    	 * Converts a Unicode string representing a domain name or an email address to
    	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
    	 * i.e. it doesn't matter if you call it with a domain that's already in
    	 * ASCII.
    	 * @memberOf punycode
    	 * @param {String} input The domain name or email address to convert, as a
    	 * Unicode string.
    	 * @returns {String} The Punycode representation of the given domain name or
    	 * email address.
    	 */
    	function toASCII(input) {
    		return mapDomain(input, function(string) {
    			return regexNonASCII.test(string)
    				? 'xn--' + encode(string)
    				: string;
    		});
    	}

    	/*--------------------------------------------------------------------------*/

    	/** Define the public API */
    	punycode = {
    		/**
    		 * A string representing the current Punycode.js version number.
    		 * @memberOf punycode
    		 * @type String
    		 */
    		'version': '1.4.1',
    		/**
    		 * An object of methods to convert from JavaScript's internal character
    		 * representation (UCS-2) to Unicode code points, and back.
    		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
    		 * @memberOf punycode
    		 * @type Object
    		 */
    		'ucs2': {
    			'decode': ucs2decode,
    			'encode': ucs2encode
    		},
    		'decode': decode,
    		'encode': encode,
    		'toASCII': toASCII,
    		'toUnicode': toUnicode
    	};

    	/** Expose `punycode` */
    	// Some AMD build optimizers, like r.js, check for specific condition patterns
    	// like the following:
    	if (freeExports && freeModule) {
    		if (module.exports == freeExports) {
    			// in Node.js, io.js, or RingoJS v0.8.0+
    			freeModule.exports = punycode;
    		} else {
    			// in Narwhal or RingoJS v0.7.0-
    			for (key in punycode) {
    				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
    			}
    		}
    	} else {
    		// in Rhino or a web browser
    		root.punycode = punycode;
    	}

    }(this));

    }).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {});
    },{}],61:[function(require,module,exports){
    module.exports=/[\0-\x1F\x7F-\x9F]/;
    },{}],62:[function(require,module,exports){
    module.exports=/[\xAD\u0600-\u0605\u061C\u06DD\u070F\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;
    },{}],63:[function(require,module,exports){
    module.exports=/[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4E\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDF55-\uDF59]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDF3C-\uDF3E]|\uD806[\uDC3B\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8]|\uD809[\uDC70-\uDC74]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/;
    },{}],64:[function(require,module,exports){
    module.exports=/[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;
    },{}],65:[function(require,module,exports){

    exports.Any = require('./properties/Any/regex');
    exports.Cc  = require('./categories/Cc/regex');
    exports.Cf  = require('./categories/Cf/regex');
    exports.P   = require('./categories/P/regex');
    exports.Z   = require('./categories/Z/regex');

    },{"./categories/Cc/regex":61,"./categories/Cf/regex":62,"./categories/P/regex":63,"./categories/Z/regex":64,"./properties/Any/regex":66}],66:[function(require,module,exports){
    module.exports=/[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
    },{}],67:[function(require,module,exports){


    module.exports = require('./lib/');

    },{"./lib/":9}]},{},[67])(67)
    });
    const markdownit = define();

    const cssStr$a = css`
body {
  --system-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Cantarell, "Oxygen Sans", "Helvetica Neue", sans-serif;
  --code-font: Consolas, 'Lucida Console', Monaco, monospace;
}

body {
  font-family: var(--system-font);
}

code {
  font-family: var(--code-font);
  font-style: normal;
}

`;

    const cssStr$b = css`
${cssStr$a}

:host {
  display: block;
  --file-height: auto;
  --text-font-size: 14px;
  --text-padding: 0;
  --text-background: transparent;
  --text-min-height: none;
  --text-max-height: none;
  --text-min-width: none;
  --text-max-width: none;
  --text-white-space: pre-wrap;
  --text-border-width: 0;
  --text-border-radius: 4px;
  --img-border-radius: 4px;
  --media-max-height: none;
  --media-padding: 0;
  --mount-padding: 0;
  --goto-padding: 12px 14px;
  --color-drive: #6c8c9e;
  --color-folder: #9ec2e0;
  --color-viewfile-outline: #a7a7ad;
}

a {
  text-decoration: none;
  color: var(--blue);
}

a:hover {
  text-decoration: underline;
}

.text {
  min-height: var(--text-min-height);
  max-height: var(--text-max-height);
  max-width: 100%;
  box-sizing: border-box;
  white-space: var(--text-white-space);
  font-style: normal;
  word-break: break-all;
  font-size: var(--text-font-size);
  padding: var(--text-padding);
  background: var(--text-background);
  max-width: var(--text-max-width);
  border: var(--text-border-width) solid #ccc;
  border-radius: var(--text-border-radius);
}

.markdown {
  box-sizing: border-box;
  padding: var(--text-padding);
  background: var(--text-background);
  min-height: var(--text-min-height);
  max-height: var(--text-max-height);
  max-width: var(--text-max-width);
  font-size: var(--text-font-size);
  border: var(--text-border-width) solid #ccc;
  border-radius: var(--text-border-radius);
  line-height: 1.4;
}

.markdown > :first-child {
  margin-top: 0;
}

.markdown > :last-child {
  margin-bottom: 0;
}

img,
video,
audio {
  max-width: 100%;
  max-height: var(--media-max-height);
  padding: var(--media-padding);
  box-sizing: border-box;
}

:host > img {
  border-radius: var(--img-border-radius);
}

:host([fullwidth]) > img {
  width: 100%;
  object-fit: cover;
}

.icon {
  position: relative;
  padding: 0 4px;
}

.icon > span {
  font-size: 80px;
  line-height: 70px;
}

.icon .fa-folder {
  color: var(--color-folder);
}

.icon .mainicon.fa-hdd {
  color: var(--color-drive);
}

.icon .fa-layer-group {
  -webkit-text-stroke: 1px var(--color-viewfile-outline);
  color: #fff;
  font-size: 64px;
}

.icon .subicon {
  position: absolute;
  color: rgba(0,0,0,.4);
  font-size: 30px;
  left: 13px;
  top: 8px;
}

.mount {
  box-sizing: border-box;
  padding: var(--mount-padding);
}

.mount img {
  display: block;
  width: 100%;
  height: 120px;
  border-radius: 8px;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border: 1px solid #ddd;
  border-bottom: 0;
  object-fit: cover;
  object-position: top;
  box-sizing: border-box;
}

.mount .info {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  box-sizing: border-box;
  background: #fff;
}

.mount .info .title {
  font-weight: 500;
  font-size: 15px;
}

.mount .info .description {
  display: none;
}

:host([horz]) .mount {
  display: grid;
  grid-template-columns: 100px 1fr;
}

:host([horz]) .mount img {
  height: 100%;
  border-radius: 8px;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border: 1px solid #ddd;
  border-right: 0;
}

:host([horz]) .mount .info {
  padding: 12px 15px;
  border-radius: 8px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

:host([horz]) .mount .info .title {
  font-size: 18px;
  font-weight: bold;
}

:host([horz]) .mount .info .description {
  display: block;
}

.goto {
  box-sizing: border-box;
  padding: var(--goto-padding);
  border: 1px solid #ddd;
  border-radius: 8px;
  box-sizing: border-box;
  background: #fff;
}

.goto > * {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.goto .title {
  font-weight: bold;
  font-size: 15px;
  margin-bottom: 2px;
}

.goto .description {
  color: gray;
}

.goto .fas {
  color: var(--blue);
  font-size: 80%;
  position: relative;
  top: -1px;
}

:host([horz]) .goto .title {
  font-size: 16px;
  font-weight: bold;
}

`;

    const md = markdownit({
      html: false, // Enable HTML tags in source
      xhtmlOut: false, // Use '/' to close single tags (<br />)
      breaks: true, // Convert '\n' in paragraphs into <br>
      langPrefix: 'language-', // CSS language prefix for fenced blocks
      linkify: false, // Autoconvert URL-like text to links

      // Enable some language-neutral replacement + quotes beautification
      typographer: true,

      // Double + single quotes replacement pairs, when typographer enabled,
      // and smartquotes on. Set doubles to '«»' for Russian, '„“' for German.
      quotes: '“”‘’',

      // Highlighter function. Should return escaped HTML,
      // or '' if the source string is not changed
      highlight: undefined
    });

    class FileDisplay extends LitElement {
      static get properties () {
        return {
          driveUrl: {type: String, attribute: 'drive-url'},
          pathname: {type: String},
          info: {type: Object},
          renderMode: {type: String, attribute: 'render-mode'}
        }
      }

      static get styles () {
        return cssStr$b
      }

      get url () {
        return joinPath(this.driveUrl, this.pathname)
      }

      constructor () {
        super();
        this.driveUrl = undefined;
        this.pathname = undefined;
        this.info = undefined;
        this.renderMode = undefined;
      }

      // rendering
      // =

      render () {
        if (this.info.stat.isDirectory()) {
          if (this.info.stat.mount && this.info.stat.mount.key) {
            return html`${until(this.renderAndRenderMount(), 'Loading...')}`
          }
          return this.renderIcon('fas fa-folder')
        } 
        if (this.pathname.endsWith('.view')) {
          return this.renderIcon('fas fa-layer-group')
        }
        if (/\.(png|jpe?g|gif)$/.test(this.pathname)) {
          return this.renderImage()
        }
        if (/\.(mp4|webm|mov)$/.test(this.pathname)) {
          return this.renderVideo()
        }
        if (/\.(mp3|ogg)$/.test(this.pathname)) {
          return this.renderAudio()
        }
        if (this.info.stat.size > 1000000) {
          return html`<div class="too-big">This file is too big to display</div>`
        }
        return html`${until(this.readAndRenderFile(), 'Loading...')}`
      }

      renderImage () {
        return html`<img src=${this.url}>`
      }

      renderVideo () {
        return html`<video controls><source src=${this.url}></video>`
      }

      renderAudio () {
        return html`<audio controls><source src=${this.url}></audio>`
      }

      renderIcon (icon) {
        return html`
      <link rel="stylesheet" href="/css/font-awesome.css">
      <div class="icon">
        <span class="${icon}"></span>
        ${this.info.subicon ? html`<span class="subicon ${this.info.subicon}"></span>` : ''}
      </div>
    `
      }

      async renderAndRenderMount () {
        var user = await navigator.filesystem.stat('/profile');
        var label = undefined;
        if (this.info.mount.key === user.mount.key) {
          label = 'My profile';
        } else if (this.info.mount.url === navigator.filesystem.url) {
          label = 'My home drive';
        }

        return html`
      <link rel="stylesheet" href="/css/font-awesome.css">
      <div class="mount">
        <img src="asset:thumb:${this.info.mount.url}?cache_buster=${Date.now()}">
        <div class="info">
          ${label ? html`<div class="label">${label}</div>` : ''}
          <div class="title">${this.info.mount.title || 'Untitled'}</div>
          <div class="description">${this.info.mount.description}</div>
        </div>
      </div>
    `
      }

      async readAndRenderFile () {
        try {
          var drive = new Hyperdrive(this.driveUrl);
          var file = await drive.readFile(this.pathname, 'utf8');

          if (this.pathname.endsWith('.md') && this.renderMode !== 'raw') {
            file = md.render(file);
            return html`<div class="markdown">${unsafeHTML(file)}</div>`
          }
          if (this.pathname.endsWith('.goto') && this.renderMode !== 'raw') {
            return html`
          <link rel="stylesheet" href="/css/font-awesome.css">
          <div class="goto">
            <div class="title"><span class="fas fa-external-link-alt"></span> ${this.info.stat.metadata.title || this.info.name}</div>
            <div class="description">${this.info.stat.metadata.href}</div>
          </div>
        `
          }

          return html`<div class="text">${file}</div>`
        } catch (e) {
          return e.toString()
        }
      }

      // events
      // =

    }

    customElements.define('file-display', FileDisplay);

    class FileView extends LitElement {
      static get properties () {
        return {
          userUrl: {type: String, attribute: 'user-url'},
          currentDriveInfo: {type: Object},
          currentDriveTitle: {type: String, attribute: 'current-drive-title'},
          pathInfo: {type: Object},
          realUrl: {type: String, attribute: 'real-url'},
          realPathname: {type: String, attribute: 'real-pathname'},
          renderMode: {type: String, attribute: 'render-mode'}
        }
      }

      static get styles () {
        return cssStr$9
      }

      constructor () {
        super();
        this.userUrl = undefined;
        this.currentDriveInfo = undefined;
        this.currentDriveTitle = undefined;
        this.pathInfo = undefined;
        this.realUrl = undefined;
        this.realPathname = undefined;
        this.renderMode = undefined;
      }

      // rendering
      // =

      render () {
        if (!this.currentDriveInfo || !this.pathInfo) return html``
        return html`
      <div class="content">
        <file-display
          drive-url=${getOrigin()}
          pathname=${getPath()}
          render-mode=${this.renderMode}
          .info=${{stat: this.pathInfo}}
        ></file-display>
      </div>
    `
      }


      // events
      // =
    }

    customElements.define('explorer-view-file', FileView);

    const cssStr$c = css`
:host {
  display: block;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.readme {
  margin: 4px 0 8px;
  padding: 14px;
  background: var(--bg-color--light);
  border-radius: 8px;
}

.add-readme-link {
  color: rgba(0,0,0,.4);
  text-decoration: none;
}

.add-readme-link:hover {
  text-decoration: underline;
}

file-display {
  --text-padding: 14px 14px 18px;
  --text-background: #fff;
  --text-max-width: 60em;
}

`;

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // Helper functions for manipulating parts
    // TODO(kschaaf): Refactor into Part API?
    const createAndInsertPart = (containerPart, beforePart) => {
        const container = containerPart.startNode.parentNode;
        const beforeNode = beforePart === undefined ? containerPart.endNode :
            beforePart.startNode;
        const startNode = container.insertBefore(createMarker(), beforeNode);
        container.insertBefore(createMarker(), beforeNode);
        const newPart = new NodePart(containerPart.options);
        newPart.insertAfterNode(startNode);
        return newPart;
    };
    const updatePart = (part, value) => {
        part.setValue(value);
        part.commit();
        return part;
    };
    const insertPartBefore = (containerPart, part, ref) => {
        const container = containerPart.startNode.parentNode;
        const beforeNode = ref ? ref.startNode : containerPart.endNode;
        const endNode = part.endNode.nextSibling;
        if (endNode !== beforeNode) {
            reparentNodes(container, part.startNode, endNode, beforeNode);
        }
    };
    const removePart = (part) => {
        removeNodes(part.startNode.parentNode, part.startNode, part.endNode.nextSibling);
    };
    // Helper for generating a map of array item to its index over a subset
    // of an array (used to lazily generate `newKeyToIndexMap` and
    // `oldKeyToIndexMap`)
    const generateMap = (list, start, end) => {
        const map = new Map();
        for (let i = start; i <= end; i++) {
            map.set(list[i], i);
        }
        return map;
    };
    // Stores previous ordered list of parts and map of key to index
    const partListCache = new WeakMap();
    const keyListCache = new WeakMap();
    /**
     * A directive that repeats a series of values (usually `TemplateResults`)
     * generated from an iterable, and updates those items efficiently when the
     * iterable changes based on user-provided `keys` associated with each item.
     *
     * Note that if a `keyFn` is provided, strict key-to-DOM mapping is maintained,
     * meaning previous DOM for a given key is moved into the new position if
     * needed, and DOM will never be reused with values for different keys (new DOM
     * will always be created for new keys). This is generally the most efficient
     * way to use `repeat` since it performs minimum unnecessary work for insertions
     * amd removals.
     *
     * IMPORTANT: If providing a `keyFn`, keys *must* be unique for all items in a
     * given call to `repeat`. The behavior when two or more items have the same key
     * is undefined.
     *
     * If no `keyFn` is provided, this directive will perform similar to mapping
     * items to values, and DOM will be reused against potentially different items.
     */
    const repeat = directive((items, keyFnOrTemplate, template) => {
        let keyFn;
        if (template === undefined) {
            template = keyFnOrTemplate;
        }
        else if (keyFnOrTemplate !== undefined) {
            keyFn = keyFnOrTemplate;
        }
        return (containerPart) => {
            if (!(containerPart instanceof NodePart)) {
                throw new Error('repeat can only be used in text bindings');
            }
            // Old part & key lists are retrieved from the last update
            // (associated with the part for this instance of the directive)
            const oldParts = partListCache.get(containerPart) || [];
            const oldKeys = keyListCache.get(containerPart) || [];
            // New part list will be built up as we go (either reused from
            // old parts or created for new keys in this update). This is
            // saved in the above cache at the end of the update.
            const newParts = [];
            // New value list is eagerly generated from items along with a
            // parallel array indicating its key.
            const newValues = [];
            const newKeys = [];
            let index = 0;
            for (const item of items) {
                newKeys[index] = keyFn ? keyFn(item, index) : index;
                newValues[index] = template(item, index);
                index++;
            }
            // Maps from key to index for current and previous update; these
            // are generated lazily only when needed as a performance
            // optimization, since they are only required for multiple
            // non-contiguous changes in the list, which are less common.
            let newKeyToIndexMap;
            let oldKeyToIndexMap;
            // Head and tail pointers to old parts and new values
            let oldHead = 0;
            let oldTail = oldParts.length - 1;
            let newHead = 0;
            let newTail = newValues.length - 1;
            // Overview of O(n) reconciliation algorithm (general approach
            // based on ideas found in ivi, vue, snabbdom, etc.):
            //
            // * We start with the list of old parts and new values (and
            // arrays of
            //   their respective keys), head/tail pointers into each, and
            //   we build up the new list of parts by updating (and when
            //   needed, moving) old parts or creating new ones. The initial
            //   scenario might look like this (for brevity of the diagrams,
            //   the numbers in the array reflect keys associated with the
            //   old parts or new values, although keys and parts/values are
            //   actually stored in parallel arrays indexed using the same
            //   head/tail pointers):
            //
            //      oldHead v                 v oldTail
            //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
            //   newParts: [ ,  ,  ,  ,  ,  ,  ]
            //   newKeys:  [0, 2, 1, 4, 3, 7, 6] <- reflects the user's new
            //   item order
            //      newHead ^                 ^ newTail
            //
            // * Iterate old & new lists from both sides, updating,
            // swapping, or
            //   removing parts at the head/tail locations until neither
            //   head nor tail can move.
            //
            // * Example below: keys at head pointers match, so update old
            // part 0 in-
            //   place (no need to move it) and record part 0 in the
            //   `newParts` list. The last thing we do is advance the
            //   `oldHead` and `newHead` pointers (will be reflected in the
            //   next diagram).
            //
            //      oldHead v                 v oldTail
            //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
            //   newParts: [0,  ,  ,  ,  ,  ,  ] <- heads matched: update 0
            //   and newKeys:  [0, 2, 1, 4, 3, 7, 6]    advance both oldHead
            //   & newHead
            //      newHead ^                 ^ newTail
            //
            // * Example below: head pointers don't match, but tail pointers
            // do, so
            //   update part 6 in place (no need to move it), and record
            //   part 6 in the `newParts` list. Last, advance the `oldTail`
            //   and `oldHead` pointers.
            //
            //         oldHead v              v oldTail
            //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
            //   newParts: [0,  ,  ,  ,  ,  , 6] <- tails matched: update 6
            //   and newKeys:  [0, 2, 1, 4, 3, 7, 6]    advance both oldTail
            //   & newTail
            //         newHead ^              ^ newTail
            //
            // * If neither head nor tail match; next check if one of the
            // old head/tail
            //   items was removed. We first need to generate the reverse
            //   map of new keys to index (`newKeyToIndexMap`), which is
            //   done once lazily as a performance optimization, since we
            //   only hit this case if multiple non-contiguous changes were
            //   made. Note that for contiguous removal anywhere in the
            //   list, the head and tails would advance from either end and
            //   pass each other before we get to this case and removals
            //   would be handled in the final while loop without needing to
            //   generate the map.
            //
            // * Example below: The key at `oldTail` was removed (no longer
            // in the
            //   `newKeyToIndexMap`), so remove that part from the DOM and
            //   advance just the `oldTail` pointer.
            //
            //         oldHead v           v oldTail
            //   oldKeys:  [0, 1, 2, 3, 4, 5, 6]
            //   newParts: [0,  ,  ,  ,  ,  , 6] <- 5 not in new map; remove
            //   5 and newKeys:  [0, 2, 1, 4, 3, 7, 6]    advance oldTail
            //         newHead ^           ^ newTail
            //
            // * Once head and tail cannot move, any mismatches are due to
            // either new or
            //   moved items; if a new key is in the previous "old key to
            //   old index" map, move the old part to the new location,
            //   otherwise create and insert a new part. Note that when
            //   moving an old part we null its position in the oldParts
            //   array if it lies between the head and tail so we know to
            //   skip it when the pointers get there.
            //
            // * Example below: neither head nor tail match, and neither
            // were removed;
            //   so find the `newHead` key in the `oldKeyToIndexMap`, and
            //   move that old part's DOM into the next head position
            //   (before `oldParts[oldHead]`). Last, null the part in the
            //   `oldPart` array since it was somewhere in the remaining
            //   oldParts still to be scanned (between the head and tail
            //   pointers) so that we know to skip that old part on future
            //   iterations.
            //
            //         oldHead v        v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2,  ,  ,  ,  , 6] <- stuck; update & move 2
            //   into place newKeys:  [0, 2, 1, 4, 3, 7, 6]    and advance
            //   newHead
            //         newHead ^           ^ newTail
            //
            // * Note that for moves/insertions like the one above, a part
            // inserted at
            //   the head pointer is inserted before the current
            //   `oldParts[oldHead]`, and a part inserted at the tail
            //   pointer is inserted before `newParts[newTail+1]`. The
            //   seeming asymmetry lies in the fact that new parts are moved
            //   into place outside in, so to the right of the head pointer
            //   are old parts, and to the right of the tail pointer are new
            //   parts.
            //
            // * We always restart back from the top of the algorithm,
            // allowing matching
            //   and simple updates in place to continue...
            //
            // * Example below: the head pointers once again match, so
            // simply update
            //   part 1 and record it in the `newParts` array.  Last,
            //   advance both head pointers.
            //
            //         oldHead v        v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2, 1,  ,  ,  , 6] <- heads matched; update 1
            //   and newKeys:  [0, 2, 1, 4, 3, 7, 6]    advance both oldHead
            //   & newHead
            //            newHead ^        ^ newTail
            //
            // * As mentioned above, items that were moved as a result of
            // being stuck
            //   (the final else clause in the code below) are marked with
            //   null, so we always advance old pointers over these so we're
            //   comparing the next actual old value on either end.
            //
            // * Example below: `oldHead` is null (already placed in
            // newParts), so
            //   advance `oldHead`.
            //
            //            oldHead v     v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6] // old head already used;
            //   advance newParts: [0, 2, 1,  ,  ,  , 6] // oldHead newKeys:
            //   [0, 2, 1, 4, 3, 7, 6]
            //               newHead ^     ^ newTail
            //
            // * Note it's not critical to mark old parts as null when they
            // are moved
            //   from head to tail or tail to head, since they will be
            //   outside the pointer range and never visited again.
            //
            // * Example below: Here the old tail key matches the new head
            // key, so
            //   the part at the `oldTail` position and move its DOM to the
            //   new head position (before `oldParts[oldHead]`). Last,
            //   advance `oldTail` and `newHead` pointers.
            //
            //               oldHead v  v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2, 1, 4,  ,  , 6] <- old tail matches new
            //   head: update newKeys:  [0, 2, 1, 4, 3, 7, 6]   & move 4,
            //   advance oldTail & newHead
            //               newHead ^     ^ newTail
            //
            // * Example below: Old and new head keys match, so update the
            // old head
            //   part in place, and advance the `oldHead` and `newHead`
            //   pointers.
            //
            //               oldHead v oldTail
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2, 1, 4, 3,   ,6] <- heads match: update 3
            //   and advance newKeys:  [0, 2, 1, 4, 3, 7, 6]    oldHead &
            //   newHead
            //                  newHead ^  ^ newTail
            //
            // * Once the new or old pointers move past each other then all
            // we have
            //   left is additions (if old list exhausted) or removals (if
            //   new list exhausted). Those are handled in the final while
            //   loops at the end.
            //
            // * Example below: `oldHead` exceeded `oldTail`, so we're done
            // with the
            //   main loop.  Create the remaining part and insert it at the
            //   new head position, and the update is complete.
            //
            //                   (oldHead > oldTail)
            //   oldKeys:  [0, 1, -, 3, 4, 5, 6]
            //   newParts: [0, 2, 1, 4, 3, 7 ,6] <- create and insert 7
            //   newKeys:  [0, 2, 1, 4, 3, 7, 6]
            //                     newHead ^ newTail
            //
            // * Note that the order of the if/else clauses is not important
            // to the
            //   algorithm, as long as the null checks come first (to ensure
            //   we're always working on valid old parts) and that the final
            //   else clause comes last (since that's where the expensive
            //   moves occur). The order of remaining clauses is is just a
            //   simple guess at which cases will be most common.
            //
            // * TODO(kschaaf) Note, we could calculate the longest
            // increasing
            //   subsequence (LIS) of old items in new position, and only
            //   move those not in the LIS set. However that costs O(nlogn)
            //   time and adds a bit more code, and only helps make rare
            //   types of mutations require fewer moves. The above handles
            //   removes, adds, reversal, swaps, and single moves of
            //   contiguous items in linear time, in the minimum number of
            //   moves. As the number of multiple moves where LIS might help
            //   approaches a random shuffle, the LIS optimization becomes
            //   less helpful, so it seems not worth the code at this point.
            //   Could reconsider if a compelling case arises.
            while (oldHead <= oldTail && newHead <= newTail) {
                if (oldParts[oldHead] === null) {
                    // `null` means old part at head has already been used
                    // below; skip
                    oldHead++;
                }
                else if (oldParts[oldTail] === null) {
                    // `null` means old part at tail has already been used
                    // below; skip
                    oldTail--;
                }
                else if (oldKeys[oldHead] === newKeys[newHead]) {
                    // Old head matches new head; update in place
                    newParts[newHead] =
                        updatePart(oldParts[oldHead], newValues[newHead]);
                    oldHead++;
                    newHead++;
                }
                else if (oldKeys[oldTail] === newKeys[newTail]) {
                    // Old tail matches new tail; update in place
                    newParts[newTail] =
                        updatePart(oldParts[oldTail], newValues[newTail]);
                    oldTail--;
                    newTail--;
                }
                else if (oldKeys[oldHead] === newKeys[newTail]) {
                    // Old head matches new tail; update and move to new tail
                    newParts[newTail] =
                        updatePart(oldParts[oldHead], newValues[newTail]);
                    insertPartBefore(containerPart, oldParts[oldHead], newParts[newTail + 1]);
                    oldHead++;
                    newTail--;
                }
                else if (oldKeys[oldTail] === newKeys[newHead]) {
                    // Old tail matches new head; update and move to new head
                    newParts[newHead] =
                        updatePart(oldParts[oldTail], newValues[newHead]);
                    insertPartBefore(containerPart, oldParts[oldTail], oldParts[oldHead]);
                    oldTail--;
                    newHead++;
                }
                else {
                    if (newKeyToIndexMap === undefined) {
                        // Lazily generate key-to-index maps, used for removals &
                        // moves below
                        newKeyToIndexMap = generateMap(newKeys, newHead, newTail);
                        oldKeyToIndexMap = generateMap(oldKeys, oldHead, oldTail);
                    }
                    if (!newKeyToIndexMap.has(oldKeys[oldHead])) {
                        // Old head is no longer in new list; remove
                        removePart(oldParts[oldHead]);
                        oldHead++;
                    }
                    else if (!newKeyToIndexMap.has(oldKeys[oldTail])) {
                        // Old tail is no longer in new list; remove
                        removePart(oldParts[oldTail]);
                        oldTail--;
                    }
                    else {
                        // Any mismatches at this point are due to additions or
                        // moves; see if we have an old part we can reuse and move
                        // into place
                        const oldIndex = oldKeyToIndexMap.get(newKeys[newHead]);
                        const oldPart = oldIndex !== undefined ? oldParts[oldIndex] : null;
                        if (oldPart === null) {
                            // No old part for this value; create a new one and
                            // insert it
                            const newPart = createAndInsertPart(containerPart, oldParts[oldHead]);
                            updatePart(newPart, newValues[newHead]);
                            newParts[newHead] = newPart;
                        }
                        else {
                            // Reuse old part
                            newParts[newHead] =
                                updatePart(oldPart, newValues[newHead]);
                            insertPartBefore(containerPart, oldPart, oldParts[oldHead]);
                            // This marks the old part as having been used, so that
                            // it will be skipped in the first two checks above
                            oldParts[oldIndex] = null;
                        }
                        newHead++;
                    }
                }
            }
            // Add parts for any remaining new values
            while (newHead <= newTail) {
                // For all remaining additions, we insert before last new
                // tail, since old pointers are no longer valid
                const newPart = createAndInsertPart(containerPart, newParts[newTail + 1]);
                updatePart(newPart, newValues[newHead]);
                newParts[newHead++] = newPart;
            }
            // Remove any remaining unused old parts
            while (oldHead <= oldTail) {
                const oldPart = oldParts[oldHead++];
                if (oldPart !== null) {
                    removePart(oldPart);
                }
            }
            // Save order of new parts for next round
            partListCache.set(containerPart, newParts);
            keyListCache.set(containerPart, newKeys);
        };
    });

    async function handleDragDrop (targetEl, x, y, targetPath, dataTransfer) {
      if (targetPath === getPath()) {
        if (dataTransfer.files && dataTransfer.files.length) {
          // files dragged into the window
          let targetUrl = joinPath(getOrigin(), targetPath);
          let n = 0;
          for (let item of dataTransfer.items) {
            try {
              await doImport(targetUrl, item);
              n++;
            } catch (e) {
              console.error(e);
              let niceError = e.toString().split(':').slice(1).join(':').trim();
              create(`${niceError}. ${n} ${pluralize(n, 'item')} imported.`, 'error');
              return
            }
            create(`Imported ${n} ${pluralize(n, 'item')}`);          
          }
          return
        }
        // TODO:
        // currently we ignore drops that are onto the current location
        // eventually drops may come from other tabs and we need to handle those
        // -prf
        return
      }

      if (targetEl) {
        targetEl.classList.add('drop-target');
      }

      var text = dataTransfer.getData('text/plain');
      if (text) {
        await handleDragDropUrls(x, y, targetPath, text.split('\n'));
      }
      // TODO: handle dropped files

      if (targetEl) {
        targetEl.classList.remove('drop-target');
      }
    }

    async function handleDragDropUrls (x, y, targetPath, urls) {
      var targetUrl = joinPath(getOrigin(), targetPath);
      var targetName = targetPath.split('/').pop();
      var items;
      if (await canWriteTo(targetUrl)) {
        items = [
          html`<div class="section-header small light">${urls.length} ${pluralize(urls.length, 'item')}...</div>`,
          {
            icon: 'far fa-copy',
            label: `Copy to ${targetName}`,
            async click () {
              let n = 0;
              for (let url of urls) {
                try {
                  await doCopy({sourceItem: url, targetFolder: targetUrl});
                  n++;
                } catch (e) {
                  console.error(e);
                  let niceError = e.toString().split(':').slice(1).join(':').trim();
                  create(`${niceError}. ${n} ${pluralize(n, 'item')} copied.`, 'error');
                  return
                }
                create(`Copied ${n} ${pluralize(n, 'item')}`);
              }
            }
          },
          {
            icon: 'cut',
            label: `Move to ${targetName}`,
            async click () {
              let n = 0;
              for (let url of urls) {
                try {
                  await doMove({sourceItem: url, targetFolder: targetUrl});
                  n++;
                } catch (e) {
                  console.error(e);
                  let niceError = e.toString().split(':').slice(1).join(':').trim();
                  create(`${niceError}. ${n} ${pluralize(n, 'item')} copied.`, 'error');
                  return
                }
                create(`Move ${n} ${pluralize(n, 'item')}`);
              }
            }
          },
          '-',
          {
            icon: 'times-circle',
            label: `Cancel`,
            click: () => {}
          }
        ];
      } else {
        items = [
          html`<div class="section-header small light"><span class="fas fa-fw fa-exclamation-triangle"></span> Can't drop here</div>`,
          html`<div class="section-header" style="font-size: 14px">The target folder is read-only.</div>`,
          '-',
          {
            icon: 'times-circle',
            label: `Cancel`,
            click: () => {}
          }
        ];
      }
      await create$1({
        x,
        y,
        roomy: false,
        noBorders: true,
        fontAwesomeCSSUrl: '/css/font-awesome.css',
        style: `padding: 4px 0`,
        items
      });
    }

    const cssStr$d = css`

:host {
  --color-drive: #ccd;
  --color-folder: #9ec2e0;
  --color-file: #bbbbcc;
  --color-goto: #bbbbce;
  --color-itemname: #484444;
  --color-itemdrive: #99a;
  --color-viewfile: #ffffff;
  --color-viewfile-outline: #a7a7ad;
  --color-hover-bg: #f3f3f8;
  --color-selected-fg: #fff;
  --color-selected-bg: #4379e4;
  --color-selected-bg-icon: #dddde5;
}

.items {
  display: grid;
  grid-template-columns: repeat(auto-fill, 110px);
  grid-template-rows: repeat(auto-fill, 86px);
  grid-gap: 15px;
  margin: 15px 0;
  width: 100%;
}

.item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px;
}

.item .fa-fw {
  font-size: 40px;
  line-height: 40px;
  margin-bottom: 5px;
}

.item .fa-fw.fa-folder {
  color: var(--color-folder);
}

.item .mainicon.fa-fw.fa-hdd {
  color: var(--color-drive);
}

.item .fa-fw.fa-layer-group {
  -webkit-text-stroke: 1px var(--color-viewfile-outline);
  color: var(--color-viewfile);
  font-size: 36px;
}

.item .fa-fw.fa-external-link-alt {
  font-size: 28px;
  color: var(--color-goto);
}

.item .fa-fw.fa-file {
  -webkit-text-stroke: 1px var(--color-file);
  color: #fff;
  font-size: 36px;
  margin-top: 1px;
  margin-bottom: 4px;
}

.item .name,
.item .author {
  color: var(--color-itemname);
  width: 100%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  border-radius: 4px;
}

.item .author {
  color: var(--color-itemdrive);
  font-size: 10px;
}

.item .subicon {
  position: absolute;
  top: 22px;
  left: 40px;
  color: rgba(0,0,0,.4);
}

.item .mounticon {
  position: absolute;
  color: #5a5a5a;
  left: 57px;
  top: 16px;
  font-size: 16px;
}

.item .subicon.fa-star {
  top: 19px;
  left: 38px;
}

.item.mount .subicon {
  top: 27px;
  font-size: 9px;
  left: 36px;
}

.item.selected {
}

.item.selected .fa-fw {
  background: var(--color-selected-bg-icon);
  border-radius: 4px;
}

.item.selected .name {
  background: var(--color-selected-bg);
  color: var(--color-selected-fg);
}

`;

    /**
     * NOTES ON DRAG & DROP EVENT BEHAVIORS
     * 
     * - The web platform is very finicky with its dragenter/dragleave/etc events and will sometimes
     *   fail to fire if the drag moves too quickly.
     * - To make sure that drop-targets get the '.drag-hover' added and removed correctly, we rely on
     *   selectively removing pointer-events on DOM elements during 'drag & drop' mode.
     * 
     * -prf
     */

    class BaseFilesView extends LitElement {
      static get properties () {
        return {
          items: {type: Array},
          itemGroups: {type: Array},
          selection: {type: Array},
          showOrigin: {type: Boolean, attribute: 'show-origin'}
        }
      }

      static get styles () {
        return cssStr$d
      }

      constructor () {
        super();
        this.items = undefined;
        this.itemGroups = [];
        this.selection = [];
        this.showOrigin = undefined;
        this.dragSelector = undefined;
        this.lastClickedItemEl = undefined;
      }

      stopDragSelection () {
        // wait for next tick so that onclick can register that we were dragging
        setTimeout(() => {
          if (this.dragSelector && this.dragSelector.el) {
            this.dragSelector.el.remove();
          }
          this.dragSelector = undefined;
        }, 1);
      }

      startDragDropMode () {
        this.dragDropModeActive = true;
        this.shadowRoot.querySelector('.container').classList.add('is-dragging');
      }

      createDragGhost (items) {
        var wrapper = document.createElement('div');
        wrapper.className = 'drag-ghost';
        items.forEach(item => {
          var el = document.createElement('div');
          el.textContent = item.name;
          wrapper.append(el);
        });
        this.shadowRoot.append(wrapper);
        return wrapper
      }

      endDragDropMode () {
        if (this.dragDropModeActive) {
          this.dragDropModeActive = false;
          this.shadowRoot.querySelector('.container').classList.remove('is-dragging');
          try { this.shadowRoot.querySelector('.drag-ghost').remove(); }
          catch (e) {}
        }
        Array.from(this.shadowRoot.querySelectorAll('.drag-hover'), el => el.classList.remove('drag-hover'));
      }

      // rendering
      // =

      render () {
        var isEmpty = this.itemGroups.reduce((acc, group) => acc && group.length === 0, true);
        return html`
      <link rel="stylesheet" href="/css/font-awesome.css">
      <div
        class="container"
        @click=${this.onClickContainer}
        @contextmenu=${this.onContextMenuContainer}
        @mousedown=${this.onMousedownContainer}
        @mousemove=${this.onMousemoveContainer}
        @mouseup=${this.onMouseupContainer}
        @dragenter=${this.onDragenterContainer}
        @dragover=${this.onDragoverContainer}
        @dragleave=${this.onDragleaveContainer}
        @drop=${this.onDropContainer}
      >
        ${this.itemGroups.map(group => {
          if (group.items.length === 0) return ''
          return html`
            <h4>${group.label}</h4>
            <div class="items">
              ${repeat(group.items, this.renderItem.bind(this))}
            </div>
          `
        })}
        ${isEmpty ? html`
          <div class="empty">This folder is empty</div>
        ` : ''}
      </div>
    `
      }

      renderItem (item) {
        return html`<div>This function must be overridden</div>`
      }

      // events
      // =

      onClickItem (e, item) {
        e.stopPropagation();
        destroy$1();

        var selection;
        if (e.metaKey) {
          let i = this.selection.indexOf(item);
          if (i === -1) {
            selection = this.selection.concat([item]);
          } else {
            this.selection.splice(i, 1);
            selection = this.selection;
          }
        } else if (e.shiftKey && this.lastClickedItemEl) {
          // shift-click to range select
          // because items are broken up into groups, the easiest way to do this
          // is to find the items using the drag-selector's hit detection
          let selector = {start: getElXY(this.lastClickedItemEl), current: getElXY(e.currentTarget)};
          let els = findElsInSelector(selector, this.shadowRoot.querySelectorAll('.item'));
          let items = els.map(el => this.items.find(i => i.url === el.dataset.url));
          selection = this.selection.slice();
          for (let item of items) {
            if (!selection.includes(item)) {
              selection.push(item);
            }
          }
        } else {
          selection = [item];
        }
        this.lastClickedItemEl = e.currentTarget;
        emit(this, 'change-selection', {detail: {selection}});
      }

      onDblClickItem (e, item) {
        emit(this, 'goto', {detail: {item}});
      }

      onContextMenuItem (e, item) {
        e.preventDefault();
        e.stopPropagation();
        destroy$1();
        if (!this.selection.includes(item)) {
          emit(this, 'change-selection', {detail: {selection: [item]}});
        }
        emit(this, 'show-context-menu', {detail: {x: e.clientX, y: e.clientY}});
      }

      onDragstartItem (e, item) {
        if (!this.selection.includes(item)) {
          emit(this, 'change-selection', {detail: {selection: [item]}});
        }

        this.stopDragSelection();
        var items = this.selection.length ? this.selection : [item];
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', items.map(item => item.url).join(`\n`));
        e.dataTransfer.setDragImage(this.createDragGhost(items), 0, 0);
        this.startDragDropMode();
      }

      onDropItem (e, item) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('drag-hover');
        var targetPath = item && item.stat.isDirectory() ? item.path : getPath();
        handleDragDrop(e.currentTarget, e.clientX, e.clientY, targetPath, e.dataTransfer);
        return false
      }

      onClickContainer (e) {
        if (!this.dragSelector || !this.dragSelector.isActive) {
          emit(this, 'change-selection', {detail: {selection: []}});
        }
      }

      onContextMenuContainer (e) {
        if (!this.dragSelector || !this.dragSelector.isActive) {
          emit(this, 'change-selection', {detail: {selection: []}});
        }
      }

      onMousedownContainer (e) {
        if (!this.dragSelector) {
          // start tracking the drag-selection positions but dont create the element
          // until a certain number of pixels have been dragged over
          this.dragSelector = {
            isActive: false,
            el: undefined,
            start: {x: e.pageX, y: e.pageY},
            current: {x: e.pageX, y: e.pageY},
            initialSelection: this.selection.slice()
          };
        }
      }

      onMousemoveContainer (e) {
        var diffMode = e.metaKey || e.shiftKey;
        if (this.dragSelector && !this.dragDropModeActive) {
          if (!e.buttons) {
            // mouseup must have happened outside of our container el
            return this.onMouseupContainer(e)
          } else {
            this.dragSelector.current = {x: e.pageX, y: e.pageY};
            if (!this.dragSelector.isActive) {
              // check if enough space has been covered to start the selector behavior
              if (
                Math.abs(this.dragSelector.current.x - this.dragSelector.start.x) > 50
                || Math.abs(this.dragSelector.current.y - this.dragSelector.start.y) > 50
              ) {
                this.dragSelector.el = createDragSelectorEl();
                this.shadowRoot.append(this.dragSelector.el);
                this.dragSelector.isActive = true;
              }
            } 
            
            if (this.dragSelector.isActive) {
              // update the drag-selector rendering and update the selection list
              positionDragSelector(this.dragSelector);
              var newSelectedEls = findElsInSelector(this.dragSelector, this.shadowRoot.querySelectorAll('.item'));
              var newSelection = newSelectedEls.map(el => this.items.find(i => i.url === el.dataset.url));
              if (diffMode) {
                for (let sel of this.dragSelector.initialSelection) {
                  let i = newSelection.indexOf(sel);
                  if (i !== -1) {
                    newSelection.splice(i, 1);
                  } else {
                    newSelection.push(sel);
                  }
                }
              }
              if (hasSelectionChanged(newSelection, this.selection)) {
                emit(this, 'change-selection', {detail: {selection: newSelection}});
              }
            }
          }
        }
        if (this.dragDropModeActive && !e.buttons) {
          // catch the case where 'drop' event occurred outside container
          this.endDragDropMode();
        }
      }

      onMouseupContainer (e) {
        if (this.dragSelector) {
          this.stopDragSelection();
        }
      }

      onDragenterContainer (e) {
        e.preventDefault();
        e.stopPropagation();

        var contanerEl = this.shadowRoot.querySelector('.container');
        var itemEl = findParent(e.target, 'folder');
        if (itemEl) {
          contanerEl.classList.remove('drag-hover');
          itemEl.classList.add('drag-hover');
          this.dragLastEntered = itemEl;
        } else if (!contanerEl.classList.contains('drag-hover')) {
          contanerEl.classList.add('drag-hover');
          this.dragLastEntered = this.shadowRoot.querySelector('.container');
        }
        e.dataTransfer.dropEffect = 'move';
        return false
      }

      onDragoverContainer (e) {
        e.preventDefault();
        e.stopPropagation();
        return false
      }

      onDragleaveContainer (e) {
        e.preventDefault();
        e.stopPropagation();
        var contanerEl = this.shadowRoot.querySelector('.container');
        var itemEl = findParent(e.target, 'folder');
        if (itemEl && itemEl !== this.dragLastEntered) {
          if (this.dragLastEntered) this.dragLastEntered.classList.add('drag-hover');
          itemEl.classList.remove('drag-hover');
        } else if (contanerEl === e.target) {
          contanerEl.classList.remove('drag-hover');
        }
      }

      onDropContainer (e) {
        e.preventDefault();
        e.stopPropagation();
        this.endDragDropMode();
        handleDragDrop(this.shadowRoot.querySelector('.container'), e.clientX, e.clientY, getPath(), e.dataTransfer);
        return false
      }
    }

    // helpers
    // =

    function createDragSelectorEl () {
      var el = document.createElement('div');
      el.classList.add('drag-selector');
      return el
    }

    function positionDragSelector (dragSelector) {
      function min (k) { return Math.min(dragSelector.start[k], dragSelector.current[k]) }
      function max (k) { return Math.max(dragSelector.start[k], dragSelector.current[k]) }

      var top = min('y');
      var left = min('x');
      var height = max('y') - top;
      var width = max('x') - left;

      dragSelector.el.style.left = left;
      dragSelector.el.style.width = width;
      dragSelector.el.style.top = top;
      dragSelector.el.style.height = height;
    }

    function findElsInSelector (dragSelector, candidateEls) {
      function min (k) { return Math.min(dragSelector.start[k], dragSelector.current[k]) }
      function max (k) { return Math.max(dragSelector.start[k], dragSelector.current[k]) }

      var dragRect = {
        top: min('y'),
        left: min('x'),
        bottom: max('y'),
        right: max('x')
      };

      return Array.from(candidateEls).filter(el => {
        let elRect = el.getClientRects()[0];
        if (dragRect.top > elRect.bottom) return false
        if (dragRect.bottom < elRect.top) return false
        if (dragRect.left > elRect.right) return false
        if (dragRect.right < elRect.left) return false
        return true
      })
    }

    function hasSelectionChanged (left, right) {
      if (left.length !== right.length) return true
      return left.reduce((v, acc) => acc || right.indexOf(v) === -1, false)
    }

    function getElXY (el) {
      let rect = el.getClientRects()[0];
      return {
        x: (rect.left + rect.right) / 2,
        y: (rect.top + rect.bottom) / 2
      }
    }

    const cssStr$e = css`
:host {
}

.container {
  min-height: calc(100vh - 50px);
}

h4 {
  border-top: 1px solid #e3e3ee;
  color: #b0b0bc;
  padding-top: 6px;
  padding-left: 4px;
  margin: 0;
  user-select: none;
}

.empty {
  background: var(--bg-color--light);
  padding: 40px;
  margin: 14px 0;
  border-radius: 8px;
  color: #667;
}

.items {
  user-select: none;
}

.item {
}

.drag-selector {
  position: fixed;
  background: #5591ff33;
  border: 1px solid #77adffee;
  pointer-events: none;
}

.drag-hover,
.drop-target {
  background: #f5f5ff !important;
  outline: rgb(191, 191, 243) dashed 1px;
}

.container.is-dragging .item:not(.folder) * {
  pointer-events: none;
}

.item.drag-hover * {
  pointer-events: none;
}

.drag-ghost {
  position: fixed;
  right: -100%;
}

`;

    class FileGrid extends BaseFilesView {
      static get styles () {
        return [cssStr$e, cssStr$d]
      }

      renderItem (item) {
        var cls = classMap({
          item: true,
          mount: !!item.mount,
          folder: item.stat.isDirectory(),
          file: item.stat.isFile(),
          selected: this.selection.includes(item)
        });
        var driveTitle = item.drive.title || 'Untitled';
        return html`
      <div
        class=${cls}
        draggable="true"
        @click=${e => this.onClickItem(e, item)}
        @dblclick=${e => this.onDblClickItem(e, item)}
        @contextmenu=${e => this.onContextMenuItem(e, item)}
        @dragstart=${e => this.onDragstartItem(e, item)}
        @drop=${e => this.onDropItem(e, item)}
        data-url=${item.url}
      >
        <span class="fas fa-fw fa-${item.icon}"></span>
        ${item.subicon ? html`<span class="subicon ${item.subicon}"></span>` : ''}
        ${item.mount ? html`<span class="mounticon fas fa-external-link-square-alt"></span>` : ''}
        <div class="name">${this.showOrigin ? item.realPath : item.name}</div>
        ${this.showOrigin ? html`<div class="author">${driveTitle}</div>` : ''}
      </div>
    `
      }
    }

    customElements.define('file-grid', FileGrid);

    /*!
     * bytes
     * Copyright(c) 2012-2014 TJ Holowaychuk
     * Copyright(c) 2015 Jed Watson
     * MIT Licensed
     */

    /**
     * Module variables.
     * @private
     */

    var formatThousandsRegExp = /\B(?=(\d{3})+(?!\d))/g;

    var formatDecimalsRegExp = /(?:\.0*|(\.[^0]+)0+)$/;

    var map = {
      b:  1,
      kb: 1 << 10,
      mb: 1 << 20,
      gb: 1 << 30,
      tb: Math.pow(1024, 4),
      pb: Math.pow(1024, 5),
    };

    var parseRegExp = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;

    /**
     * Convert the given value in bytes into a string or parse to string to an integer in bytes.
     *
     * @param {string|number} value
     * @param {{
     *  case: [string],
     *  decimalPlaces: [number]
     *  fixedDecimals: [boolean]
     *  thousandsSeparator: [string]
     *  unitSeparator: [string]
     *  }} [options] bytes options.
     *
     * @returns {string|number|null}
     */

    function bytes(value, options) {
      if (typeof value === 'string') {
        return parse(value);
      }

      if (typeof value === 'number') {
        return format(value, options);
      }

      return null;
    }

    /**
     * Format the given value in bytes into a string.
     *
     * If the value is negative, it is kept as such. If it is a float,
     * it is rounded.
     *
     * @param {number} value
     * @param {object} [options]
     * @param {number} [options.decimalPlaces=2]
     * @param {number} [options.fixedDecimals=false]
     * @param {string} [options.thousandsSeparator=]
     * @param {string} [options.unit=]
     * @param {string} [options.unitSeparator=]
     *
     * @returns {string|null}
     * @public
     */

    function format(value, options) {
      if (!Number.isFinite(value)) {
        return null;
      }

      var mag = Math.abs(value);
      var thousandsSeparator = (options && options.thousandsSeparator) || '';
      var unitSeparator = (options && options.unitSeparator) || '';
      var decimalPlaces = (options && options.decimalPlaces !== undefined) ? options.decimalPlaces : 2;
      var fixedDecimals = Boolean(options && options.fixedDecimals);
      var unit = (options && options.unit) || '';

      if (!unit || !map[unit.toLowerCase()]) {
        if (mag >= map.pb) {
          unit = 'PB';
        } else if (mag >= map.tb) {
          unit = 'TB';
        } else if (mag >= map.gb) {
          unit = 'GB';
        } else if (mag >= map.mb) {
          unit = 'MB';
        } else if (mag >= map.kb) {
          unit = 'KB';
        } else {
          unit = 'B';
        }
      }

      var val = value / map[unit.toLowerCase()];
      var str = val.toFixed(decimalPlaces);

      if (!fixedDecimals) {
        str = str.replace(formatDecimalsRegExp, '$1');
      }

      if (thousandsSeparator) {
        str = str.replace(formatThousandsRegExp, thousandsSeparator);
      }

      return str + unitSeparator + unit;
    }

    /**
     * Parse the string value into an integer in bytes.
     *
     * If no unit is given, it is assumed the value is in bytes.
     *
     * @param {number|string} val
     *
     * @returns {number|null}
     * @public
     */

    function parse(val) {
      if (typeof val === 'number' && !isNaN(val)) {
        return val;
      }

      if (typeof val !== 'string') {
        return null;
      }

      // Test if the string passed is valid
      var results = parseRegExp.exec(val);
      var floatValue;
      var unit = 'b';

      if (!results) {
        // Nothing could be extracted from the given string
        floatValue = parseInt(val, 10);
        unit = 'b';
      } else {
        // Retrieve the value and the unit
        floatValue = parseFloat(results[1]);
        unit = results[4].toLowerCase();
      }

      return Math.floor(map[unit] * floatValue);
    }

    const cssStr$f = css`

:host {
  --color-drive: #ccd;
  --color-folder: #9ec2e0;
  --color-file: #9a9aab;
  --color-goto: #9a9aab;
  --color-subicon: #556;
  --color-itemname: #333;
  --color-itemprop: #777;
  --color-viewfile: #ffffff;
  --color-viewfile-outline: #95959c;
  --color-hover-bg: #f3f3f8;
  --color-subicon-selected: #fff;
  --color-itemname-selected: #fff;
  --color-itemprop-selected: rgba(255, 255, 255, 0.7);
  --color-selected-bg: #4379e4;
}

.items {
  margin: 5px 0 15px;
  width: 100%;
  user-select: none;
}

.item {
  position: relative;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #fff5;
  padding: 4px;
  letter-spacing: -0.2px;
}

.item > * {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--color-itemprop);
}

.item .icon {
  position: relative;
  overflow: initial;
  font-size: 18px;
  line-height: 18px;
  width: 30px;
}

.item .icon .mainicon {
  width: 24px;
}

.item .fa-fw.fa-folder {
  color: var(--color-folder);
}

.item .mainicon.fa-fw.fa-hdd {
  color: var(--color-drive);
}

.item .fa-fw.fa-layer-group {
  -webkit-text-stroke: 1px var(--color-viewfile-outline);
  color: var(--color-viewfile);
}

.item .fa-fw.fa-file {
  -webkit-text-stroke: 1px var(--color-file);
  color: #fff;
}

.item .fa-fw.fa-external-link-alt {
  color: var(--color-goto);
  font-size: 13px;
}

.item .subicon {
  color: var(--color-subicon);
  font-size: 10px;
  position: absolute;
  left: 0;
  bottom: 0;
}

.item .subicon.fa-rss {
  left: -1px;
}

.item .author {
  width: 100px;
}

.item .name {
  color: var(--color-itemname);
  flex: 1;
}

.item .date {
  width: 160px;
}

.item .date span {
  opacity: 0.75;
}

.item .size {
  width: 100px;
  text-align: right;
}

.item.selected {
  background: var(--color-selected-bg);
}

.item.selected > * {
  color: var(--color-itemprop-selected);
}

.item.selected .name {
  color: var(--color-itemname-selected);
}

.item.selected .fa-fw {
  text-shadow: 0 1px 2px rgba(0,0,0,.4);
  -webkit-text-stroke: 0;
}

.item.selected .subicon {
  color: var(--color-subicon-selected);
}

`;

    class FileList extends BaseFilesView {
      static get styles () {
        return [cssStr$e, cssStr$f]
      }

      constructor () {
        super();
        this.dateFormatter = new Intl.DateTimeFormat('en-us', {day: "numeric", month: "short", year: "numeric",});
        this.timeFormatter = new Intl.DateTimeFormat('en-US', {hour12: true, hour: "2-digit", minute: "2-digit"});
      }

      // rendering
      // =

      renderItem (item) {
        var cls = classMap({
          item: true,
          mount: !!item.mount,
          folder: item.stat.isDirectory(),
          file: item.stat.isFile(),
          selected: this.selection.includes(item)
        });
        var driveTitle = item.drive.title || 'Untitled';
        return html`
      <div
        class=${cls}
        draggable="true"
        @click=${e => this.onClickItem(e, item)}
        @dblclick=${e => this.onDblClickItem(e, item)}
        @contextmenu=${e => this.onContextMenuItem(e, item)}
        @dragstart=${e => this.onDragstartItem(e, item)}
        @drop=${e => this.onDropItem(e, item)}
        data-url=${item.url}
      >
        ${this.showOrigin ? html`<span class="author">${driveTitle}</span>` : ''}
        <span class="icon">
          <span class="fas fa-fw fa-${item.icon} mainicon"></span>
          ${item.subicon ? html`<span class="fas fa-fw fa-${item.subicon} subicon"></span>` : ''}
          ${item.mount ? html`<span class="fas fa-fw fa-external-link-square-alt subicon"></span>` : ''}
        </span>
        <span class="name">${this.showOrigin ? item.realPath : item.name}</span>
        <span class="date">${this.dateFormatter.format(item.stat.ctime)} <span>at</span> ${this.timeFormatter.format(item.stat.ctime)}</span>
        <span class="size">${item.stat.size ? format(item.stat.size) : ''}</span>
      </div>
    `
      }
    }

    customElements.define('file-list', FileList);

    const cssStr$g = css`
${cssStr$5}

:host {
  display: block;
  padding-bottom: 10px;

  --color-selected-bg: #f3f3f8;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 180px));
  grid-gap: 10px 10px;
  width: 100%;
  padding: 10px 10px 20px 10px;
  box-sizing: border-box;
}

.item {
  border-radius: 8px;
}

.item .header {
  padding: 4px 4px;
  font-size: 12px;
}

.item .header div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item .header .author {
  color: #99a;
}

.item .header .name {
  color: #556;
  font-weight: 500;
}

.item .content {
  border: 1px solid transparent;
  border-radius: 8px;
  overflow: hidden;
}

.item .content file-display {
  overflow: hidden;
  pointer-events: none;
  --text-max-height: 170px;
  --text-font-size: 11px;
  --text-padding: 10px;
  --text-white-space: pre;
  --text-border-width: 1px;
  --text-border-radius: 8px;
  --text-background: #fff;
  --img-border-radius: 0;
}

.item.selected {
  background: var(--color-selected-bg);
}

.item.selected .content {
}
`;

    class InlineFileGrid extends BaseFilesView {
      static get styles () {
        return [cssStr$e, cssStr$g]
      }

      renderItem (item) {
        var cls = classMap({
          item: true,
          folder: item.stat.isDirectory(),
          selected: this.selection.includes(item)
        });
        var driveTitle = item.drive.title || 'Untitled';
        return html`
      <div
        class=${cls}
        draggable="true"
        @click=${e => this.onClickItem(e, item)}
        @dblclick=${e => this.onDblClickItem(e, item)}
        @contextmenu=${e => this.onContextMenuItem(e, item)}
        @dragstart=${e => this.onDragstartItem(e, item)}
        @drop=${e => this.onDropItem(e, item)}
        data-url=${item.url}
      >
        <div class="content">
          <file-display
            drive-url=${item.drive.url}
            pathname=${item.realPath}
            .info=${item}
          ></file-display>
        </div>
        <div class="header">
          <div>
            <a class="name" href=${item.url}>${this.showOrigin ? item.realPath : item.name}</a>
          </div>
          ${this.showOrigin ? html`
            <div><a class="author" href=${item.drive.url} title=${driveTitle}>${driveTitle}</a></div>
          ` : ''}
        </div>
      </div>
    `
      }
    }

    customElements.define('inline-file-grid', InlineFileGrid);

    const cssStr$h = css`
${cssStr$5}

:host {
  display: block;
  --color-selected-bg: #f3f3f8;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.items {
  padding: 0;
  box-sizing: border-box;
}

.item {
  display: flex;
  padding: 10px;
  overflow: hidden;
  border-top: 1px solid #eee;
}

.item .info {
  flex: 0 0 160px;
  width: 160px;
  padding-right: 10px;
  box-sizing: border-box;
  font-size: 12px;
  color: #99a;
}

.item .info img {
  display: inline-block;
  object-fit: cover;
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.item .info div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item .info .name {
  font-weight: 500;
  font-size: 14px;
  line-height: 21px;
}

.item .info .name,
.item .info .folder,
.item .info .date {
  color: #556;
}

.item .info .author {
  color: var(--blue);
  font-weight: 500;
}

.item .content {
  flex: 1;
  overflow: hidden;
  max-height: 50vh;
}

.item .content file-display {
  --text-padding: 10px;
  --text-white-space: pre;
  --text-border-width: 1px;
  --text-border-radius: 8px;
  --text-min-height: 80px;
  --text-max-height: 50vh;
  --text-background: #fff;
  --img-border-radius: 8px;
  --media-max-height: 50vh;
  --mount-padding: 0;
}

.item.selected {
  background: var(--color-selected-bg);
}
`;

    class InlineFileList extends BaseFilesView {
      static get styles () {
        return [cssStr$e, cssStr$h]
      }

      renderItem (item) {
        var cls = classMap({
          item: true,
          folder: item.stat.isDirectory(),
          selected: this.selection.includes(item)
        });
        var driveTitle = item.drive.title || 'Untitled';
        return html`
      <div
        class=${cls}
        draggable="true"
        @click=${e => this.onClickItem(e, item)}
        @dblclick=${e => this.onDblClickItem(e, item)}
        @contextmenu=${e => this.onContextMenuItem(e, item)}
        @dragstart=${e => this.onDragstartItem(e, item)}
        @drop=${e => this.onDropItem(e, item)}
        data-url=${item.url}
      >
        <div class="info">
          <div>
            <a class="name" href=${item.url}>
              ${this.showOrigin ? item.realPath : item.name}
            </a>
          </div>
          ${this.showOrigin ? html`
            <div>Drive: <a class="author" href=${item.drive.url}>${driveTitle}</a></div>
          ` : ''}
          <div>
            Updated: <span class="date">${timeDifference(item.stat.ctime, true, 'ago')}</span>
          </div>
        </div>
        <div class="content">
          <file-display
            horz
            drive-url=${item.drive.url}
            pathname=${item.realPath}
            .info=${item}
          ></file-display>
        </div>
      </div>
    `
      }
    }

    customElements.define('inline-file-list', InlineFileList);

    class FolderView extends LitElement {
      static get properties () {
        return {
          userUrl: {type: String, attribute: 'user-url'},
          currentDriveInfo: {type: Object},
          currentDriveTitle: {type: String, attribute: 'current-drive-title'},
          items: {type: Array},
          itemGroups: {type: Array},
          selection: {type: Array},
          renderMode: {type: String, attribute: 'render-mode'},
          inlineMode: {type: Boolean, attribute: 'inline-mode'},
          realUrl: {type: String, attribute: 'real-url'},
          realPathname: {type: String, attribute: 'real-pathname'}
        }
      }

      static get styles () {
        return cssStr$c
      }

      constructor () {
        super();
        this.userUrl = undefined;
        this.currentDriveInfo = undefined;
        this.currentDriveTitle = undefined;
        this.items = undefined;
        this.itemGroups = undefined;
        this.selection = undefined;
        this.renderMode = undefined;
        this.inlineMode = undefined;
        this.realUrl = undefined;
        this.realPathname = undefined;
      }

      getInlineMdItem () {
        var md = this.items.find(item => item.name.toLowerCase() === 'readme.md');
        if (md) return md
      }

      // rendering
      // =

      render () {
        if (!this.currentDriveInfo || !this.items || !this.selection) return html``
        // if (this.renderMode === 'feed') {
        //   return html`
        //     <file-feed
        //       user-url=${this.userUrl}
        //       real-url=${this.realUrl}
        //       real-pathname=${this.realPathname}
        //       current-drive-title=${this.currentDriveTitle}
        //       .currentDriveInfo=${this.currentDriveInfo}
        //       .items=${this.items}
        //       .selection=${this.selection}
        //     ></file-feed>
        //   `
        // }
        var inlineMdItem = this.getInlineMdItem();
        return html`
      ${this.renderMode === 'grid' ? (
        this.inlineMode
          ? html`<inline-file-grid .items=${this.items} .itemGroups=${this.itemGroups} .selection=${this.selection}></inline-file-grid>`
          : html`<file-grid .items=${this.items} .itemGroups=${this.itemGroups} .selection=${this.selection}></file-grid>`
      ) : (
        this.inlineMode
          ? html`<inline-file-list .items=${this.items} .itemGroups=${this.itemGroups} .selection=${this.selection}></inline-file-list>`
          : html`<file-list .items=${this.items} .itemGroups=${this.itemGroups} .selection=${this.selection}></file-list>`
      )}
      ${''/* TODO inlineMdItem ? html`
        <div class="readme">
          <file-display
            drive-url=${this.currentDriveInfo.url}
            pathname=${joinPath(this.realPathname, inlineMdItem.name)}
            .info=${{stat: inlineMdItem.stat}}
          ></file-display>
        </div>
      ` : this.currentDriveInfo.writable ? html`
        <div class="readme">
          <a class="add-readme-link" href="#" @click=${this.onAddReadme}>+ Add README.md</a>
        </div>
      ` : ''}*/}
    `
      }

      // events
      // =

      // onAddReadme (e) {
      //   var drive = new Hyperdrive(this.currentDriveInfo.url)
      //   drive.writeFile(this.realPathname + '/README.md', '')
      //   window.location = this.realUrl + '/README.md?edit'
      // }
    }

    customElements.define('explorer-view-folder', FolderView);

    class QueryView extends LitElement {
      static get properties () {
        return {
          currentDriveInfo: {type: Object},
          currentDriveTitle: {type: String, attribute: 'current-drive-title'},
          pathInfo: {type: Object},
          items: {type: Array},
          itemGroups: {type: Array},
          selection: {type: Array},
          renderMode: {type: String, attribute: 'render-mode'},
          inlineMode: {type: Boolean, attribute: 'inline-mode'},
          realUrl: {type: String, attribute: 'real-url'},
          realPathname: {type: String, attribute: 'real-pathname'}
        }
      }

      constructor () {
        super();
        this.currentDriveInfo = undefined;
        this.currentDriveTitle = undefined;
        this.pathInfo = undefined;
        this.items = undefined;
        this.itemGroups = undefined;
        this.selection = undefined;
        this.renderMode = undefined;
        this.inlineMode = undefined;
        this.realUrl = undefined;
        this.realPathname = undefined;
      }

      // rendering
      // =

      render () {
        if (!this.currentDriveInfo || !this.pathInfo) return html``
        return html`
      ${this.renderMode === 'grid' ? (
        this.inlineMode
          ? html`<inline-file-grid show-origin .items=${this.items} .itemGroups=${this.itemGroups} .selection=${this.selection}></inline-file-grid>`
          : html`<file-grid show-origin .items=${this.items} .itemGroups=${this.itemGroups} .selection=${this.selection}></file-grid>`
      ) : (
        this.inlineMode
          ? html`<inline-file-list show-origin .items=${this.items} .itemGroups=${this.itemGroups} .selection=${this.selection}></inline-file-list>`
          : html`<file-list show-origin .items=${this.items} .itemGroups=${this.itemGroups} .selection=${this.selection}></file-list>`
      )}
    `
      }

      // events
      // =
    }

    customElements.define('explorer-view-query', QueryView);

    class PathAncestry extends LitElement {
      static get properties () {
        return {
          driveTitle: {type: String, attribute: 'drive-title'},
          driveInfo: {type: Object},
          pathAncestry: {type: Array}
        }
      }

      constructor () {
        super();
        this.driveTitle = undefined;
        this.driveInfo = undefined;
        this.pathAncestry = [];
      }

      createRenderRoot () {
        return this // no shadow dom
      }

      // rendering
      // =

      render () {
        if (!this.driveInfo) return html``
        return html`
      <a
        class="author"
        href=${'/' + this.driveInfo.url.replace(/^hd:\/\//, '')}
        @dragenter=${this.onDragenter}
        @dragleave=${this.onDragleave}
        @dragover=${this.onDragOver}
        @drop=${e => this.onDrop(e, undefined)}
      >
        <span class="fas fa-fw fa-hdd"></span> ${this.driveTitle}
      </a>
      ${this.renderPathAncestry()}
    `
      }
      
      renderPathAncestry () {
        return this.pathAncestry.map(item => {
          const icon = item.mount ? 'fas fa-external-link-square-alt' : item.stat.isDirectory() ? 'far fa-folder' : 'far fa-file';
          return html`
        <span class="fas fa-fw fa-angle-right"></span>
        <a
          class="name"
          href=${'/' + this.driveInfo.url.replace(/^hd:\/\//, '') + item.path}
          @dragenter=${this.onDragenter}
          @dragleave=${this.onDragleave}
          @dragover=${this.onDragOver}
          @drop=${e => this.onDrop(e, item)}
        >
          <span class="fa-fw ${icon}"></span>
          ${item.mount ? item.mount.title : item.name}
        </a>
      `
        })
      }

      // events
      // =

      onDragenter (e) {
        e.preventDefault();
        e.target.classList.add('drag-hover');
        return false
      }

      onDragleave (e) {
        e.target.classList.remove('drag-hover');
      }

      onDragOver (e) {
        e.preventDefault();
        return false
      }

      onDrop (e, item) {
        Array.from(this.querySelectorAll('.drag-hover'), el => el.classList.remove('drag-hover'));
        var targetPath = item ? item.path : '/';
        handleDragDrop(e.currentTarget, e.clientX, e.clientY, targetPath, e.dataTransfer);
      }

    }

    customElements.define('path-ancestry', PathAncestry);

    class DriveInfo extends LitElement {
      static get properties () {
        return {
          userUrl: {type: String, attribute: 'user-url'},
          realUrl: {type: String, attribute: 'real-url'},
          driveInfo: {type: Object},
          hasThumb: {type: Boolean}
        }
      }

      constructor () {
        super();
        this.userUrl = undefined;
        this.realUrl = undefined;
        this.driveInfo = undefined;
        this.hasThumb = true;
      }

      createRenderRoot () {
        return this // no shadow dom
      }

      get title () {
        var info = this.driveInfo;
        if (info.title) return info.title
        return 'Untitled'
      }

      // rendering
      // =

      render () {
        if (!this.driveInfo) return html``
        return html`
      <section>
        <h1>
          ${this.hasThumb ? html`
            <img @error=${this.onThumbError}>
          ` : ''}
          <a href="/">${this.title}</a>
        </h1>
        ${this.driveInfo.description ? html`<p>${this.driveInfo.description}</p>` : undefined}
        <p class="facts">
          ${this.renderType()}
          ${this.renderSize()}
        </p>
        ${this.driveInfo.type === 'unwalled.garden/person' ? html`
          ${this.driveInfo.url !== this.userUrl ? '' : html`
            <div class="bottom-ctrls">
              <span class="label verified"><span class="fas fa-fw fa-check-circle"></span> My profile</span>
              <a class="btn" href=${this.realUrl} target="_blank"><span class="fas fa-fw fa-desktop"></span> Open as Website</a>
            </div>
          `}
        ` : this.driveInfo.url === navigator.filesystem.url ? html`
          <div class="bottom-ctrls">
            <span class="label verified"><span class="fas fa-fw fa-check-circle"></span> My home drive</span>
          </div>
        ` : html`
          <div class="bottom-ctrls">
            <a class="btn" href=${this.realUrl} target="_blank"><span class="fas fa-fw fa-desktop"></span> Open as Website</a>
          </div>
        `}
      </section>
    `
      }

      updated () {
        // HACK
        // for reasons I cant understand, just changing the `src` attribute failed to update the image
        // this solves that issue
        // -prf
        try {
          this.querySelector('img').removeAttribute('src');
          this.querySelector('img').setAttribute('src', `${this.driveInfo.url}/thumb`);
        } catch (e) {}
      }

      renderType () {
        if (this.driveInfo.type === 'unwalled.garden/person') {
          return html`<span><span class="fas fa-fw fa-user-circle"></span> Person</span>`
        }
        if (this.driveInfo.type === 'unwalled.garden/website') {
          return html`<span><span class="far fa-fw fa-file-alt"></span> Website</span>`
        }
      }

      renderSize () {
        if (this.driveInfo.size) {
          return html`<span><span class="fas fa-fw fa-save"></span> ${bytes(this.driveInfo.size)}</span>`
        }
      }

      // events
      // =

      onThumbError () {
        this.hasThumb = false;
      }
    }

    customElements.define('drive-info', DriveInfo);

    class ViewfileInfo extends LitElement {
      static get properties () {
        return {
          currentDriveInfo: {type: Object},
          pathInfo: {type: Object},
          viewfileObj: {type: Object}
        }
      }

      constructor () {
        super();
        this.currentDriveInfo = undefined;
        this.pathInfo = undefined;
        this.viewfileObj = undefined;
      }

      createRenderRoot () {
        return this // no shadow dom
      }

      get mergeMode () {
        return this.viewfileObj['unwalled.garden/explorer-view'] && this.viewfileObj['unwalled.garden/explorer-view'].merge
      }

      // rendering
      // =

      render () {
        if (!this.viewfileObj) return ''
        return html`
      <link rel="stylesheet" href="/css/font-awesome.css">
      <section>
        <h3><a href=${getUrl()}>${getPath().split('/').pop()}</a></h3>
        <p class="facts">
          ${this.renderDrive()}
        </p>
      </section>
      <section>
        <h4><span class="fas fa-fw fa-layer-group"></span> View query:</h4>
        ${this.mergeMode ? html`
          <div class="label" style="margin-top: 5px">
            <span class="fas fa-fw fa-compress-arrows-alt"></span> Merging folders by ${this.mergeMode}
          </div>
        ` : ''}
        <pre style="margin-top: 5px">${JSON.stringify(this.viewfileObj.query, null, 2)}</pre>
      </section>
    `
      }

      renderDrive () {
        var drive = this.currentDriveInfo;
        return html`<span><small>Drive:</small> <a href=${drive.url} title=${drive.title}>${drive.title}</a>`
      }

      // events
      // =

    }

    customElements.define('viewfile-info', ViewfileInfo);

    class SelectionInfo extends LitElement {
      static get properties () {
        return {
          driveInfo: {type: Object},
          pathInfo: {type: Object},
          mountInfo: {type: Object},
          selection: {type: Array},
          noPreview: {type: Boolean, attribute: 'no-preview'},
          userUrl: {type: String, attribute: 'user-url'}
        }
      }

      constructor () {
        super();
        this.title = undefined;
        this.driveInfo = undefined;
        this.pathInfo = undefined;
        this.mountInfo = undefined;
        this.selection = [];
        this.noPreview = undefined;
        this.userUrl = undefined;
      }

      createRenderRoot () {
        return this // no shadow dom
      }

      // rendering
      // =

      render () {
        if (this.selection.length > 1) {
          return html`
        <section><strong>${this.selection.length} items selected</strong></section>
      `
        }
        var sel = this.selection[0];
        return html`
      <link rel="stylesheet" href="/css/font-awesome.css">
      <section>
        <h3>${sel.path}</h3>
        ${this.renderSize()}
        ${sel.mount ? html`
          <drive-info .driveInfo=${sel.mount} user-url=${this.userUrl}></drive-info>
        ` : ''}
        ${!this.noPreview && sel.stat.isFile() ? html`
          <section>
            <file-display
              drive-url=${sel.drive.url}
              pathname=${sel.realPath}
              .info=${sel}
            ></file-display>
          </section>
        ` : ''}
      </section>
    `
      }

      renderSize () {
        const sz = this.selection[0].stat.size;
        if (!sz || this.selection.length > 1) return undefined
        return html`<p class="facts"><span><span class="fas fa-fw fa-save"></span> ${bytes(sz)}</span></p>`
      }

      // events
      // =

    }

    customElements.define('selection-info', SelectionInfo);

    class ContextualHelp extends LitElement {
      static get properties () {
        return {
          userUrl: {type: String, attribute: 'user-url'},
          realPathname: {type: String, attribute: 'real-pathname'},
          driveInfo: {type: Object},
          mountInfo: {type: Object},
          pathInfo: {type: Object},
          selection: {type: Array},
        }
      }

      constructor () {
        super();
        this.userUrl = undefined;
        this.realPathname = undefined;
        this.driveInfo = undefined;
        this.mountInfo = undefined;
        this.pathInfo = undefined;
        this.selection = [];
      }

      createRenderRoot () {
        return this // no shadow dom
      }

      get targetDrive () {
        if (this.selection.length > 1) return undefined
        if (this.selection.length === 1 && this.selection[0].mount) return this.selection[0].mount
        if (this.mountInfo) return this.mountInfo
        return this.driveInfo
      }

      get targetItemUrl () {
        if (this.selection.length === 1) {
          return this.selection[0].shareUrl
        }
        return joinPath(this.targetDrive.url, this.realPathname)
      }

      get targetItemLabel () {
        return this.pathInfo.isDirectory() ? 'folder' : 'file'
      }

      // rendering
      // =

      render () {
        const target = this.targetDrive;
        if (!target) return html``
        return html`
      <section class="help">
        <table>
          ${this.renderUrlCtrl()}
          ${this.renderVisibilityHelp()}
          ${this.renderIsWritableHelp()}
        </table>
      </section>
    `
      }

      renderUrlCtrl () {
        if (this.targetDrive.url === navigator.filesystem.url) {
          return ''
        }
        return html`
      <tr>
        <td class="tooltip-right" data-tooltip="Click here to copy the URL" @click=${this.onClickCopyUrl} style="cursor: pointer">
          <span class="fas fa-link"></span>
        </td>
        <td>
          <input value="${this.targetItemUrl}">
        </td>
      </tr>
    `
      }

      renderVisibilityHelp () {
        if (this.targetDrive.url === navigator.filesystem.url) {
          return html`<tr><td><span class="fas fa-lock"></span></td><td>Only you can see this ${this.targetItemLabel}.</td></tr>`
        }
        return html`<tr><td><span class="fas fa-globe"></span></td><td>Anyone with the link can view this ${this.targetItemLabel}.</td></tr>`
      }

      renderIsWritableHelp () {
        if (this.targetDrive.writable) {
          return html`<tr><td><span class="fas fa-fw fa-pen"></span></td><td>Only you can edit this ${this.targetItemLabel}.</td></tr>`
        }
        return html`<tr><td><span class="fas fa-fw fa-eye"></span></td><td>You can not edit this ${this.targetItemLabel}.</td></tr>`
      }

      // events
      // =

      onClickCopyUrl (e) {
        e.preventDefault();
        e.stopPropagation();
        writeToClipboard(this.targetItemUrl);
        create('Copied to clipboard');
      }

    }

    customElements.define('contextual-help', ContextualHelp);

    const LOADING_STATES = {
      INITIAL: 0,
      CONTENT: 1,
      LOADED: 2
    };

    class ExplorerApp extends LitElement {
      static get properties () {
        return {
          selection: {type: Array},
          renderMode: {type: String},
          inlineMode: {type: Boolean},
          sortMode: {type: String},
          hideNavLeft: {type: Boolean},
          hideNavRight: {type: Boolean}
        }
      }

      static get styles () {
        return cssStr$8
      }

      constructor () {
        super();

        // location information
        this.user = undefined;
        this.driveInfo = undefined;
        this.pathInfo = undefined;
        this.mountInfo = undefined;
        this.pathAncestry = [];
        this.items = [];
        this.viewfileObj = undefined;
        this.driveTitle = undefined;
        this.mountTitle = undefined;
        
        // UI state
        this.loadingState = LOADING_STATES.INITIAL;
        this.errorState = undefined;
        this.selection = [];
        this.renderMode = undefined;
        this.inlineMode = false;
        this.sortMode = undefined;
        this.hideNavLeft = true;
        this.hideNavRight = false;
        
        this.load();
      }

      getRealPathname (pathname) {
        var slicePoint = this.mountInfo ? (this.mountInfo.mountPath.length + 1) : 0;
        return pathname.slice(slicePoint) || '/'
      }

      getRealUrl (pathname) {
        return joinPath(this.currentDriveInfo.url, this.getRealPathname(pathname))
      }

      get filename () {
        return getPath().split('/').pop()
      }

      get realUrl () {
        return this.getRealUrl(getPath())
      }

      get realPathname () {
        return this.getRealPathname(getPath())
      }

      get currentDriveInfo () {
        return this.mountInfo || this.driveInfo
      }

      get currentDriveTitle () {
        return this.mountTitle || this.driveTitle
      }

      get locationAsItem () {
        return {
          name: this.filename,
          stat: this.pathInfo,
          path: getPath(),
          url: getUrl(),
          drive: this.currentDriveInfo,
          realUrl: this.realUrl
        }
      }

      get currentShareUrl () {
        return this.selection[0] ? this.selection[0].shareUrl : this.realUrl
      }

      get isViewingQuery () {
        return getPath().endsWith('.view')
      }

      updated () {
        if (this.loadingState === LOADING_STATES.INITIAL) {
          setTimeout(() => {
            try {
              // fade in the loading view so that it only renders if loading is taking time
              this.shadowRoot.querySelector('.loading-view').classList.add('visible');
            } catch (e) {}
          }, 1);
        }
      }

      async attempt (task, fn) {
        console.debug(task); // leave this in for live debugging
        try {
          return await fn()
        } catch (e) {
          this.errorState = {task, error: e};
          this.requestUpdate();
          if (e.name === 'TimeoutError') {
            return this.attempt(task, fn)
          } else {
            throw e
          }
        }
      }

      async load () {
        if (!this.user) {
          let userStat = await navigator.filesystem.stat('/profile');
          this.user = {url: `hd://${userStat.mount.key}`};
        }

        // read location information
        var drive = new Hyperdrive(getOrigin());
        try {
          this.driveInfo = await this.attempt(`Reading drive information (${getOrigin()})`, () => drive.getInfo());
          this.driveTitle = getDriveTitle(this.driveInfo);
          this.mountTitle = this.mountInfo ? getDriveTitle(this.mountInfo) : undefined;
          document.title = this.filename ? `${this.driveTitle} / ${this.filename}` : this.driveTitle;

          this.pathInfo = await this.attempt(`Reading path information (${getPath()})`, () => drive.stat(getPath()));
          await this.readPathAncestry();
        } catch (e) {
          if (e.name === 'NotFoundError') {
            this.pathInfo = {isFile: ()=>false, isDirectory: ()=>false};
            this.loadingState = LOADING_STATES.LOADED;
            this.requestUpdate();
            return
          }
        }

        // view config
        if (this.pathInfo.isDirectory()) {
          this.renderMode = getSavedConfig('render-mode', 'list');
          this.inlineMode = Boolean(getSavedConfig('inline-mode', false));
          this.sortMode = getSavedConfig('sort-mode', 'name');
          if (!this.watchStream) {
            let currentDrive = new Hyperdrive(this.currentDriveInfo.url);
            this.watchStream = currentDrive.watch(this.realPathname);
            var hackSetupTime = Date.now();
            this.watchStream.addEventListener('changed', e => {
              // HACK
              // for some reason, the watchstream is firing 'changed' immediately
              // ignore if the event fires within 1s of setup
              // -prf
              if (Date.now() - hackSetupTime <= 1000) return
              this.load();
            });
          }
        } else if (getPath().endsWith('.view')) {
          this.renderMode = getSavedConfig('render-mode', getVFCfg(this.viewfileObj, 'renderMode', ['grid', 'list']) || 'list');
          this.inlineMode = Boolean(getSavedConfig('inline-mode', getVFCfg(this.viewfileObj, 'inline', [true, false]) || false));
          this.sortMode = getSavedConfig('sort-mode', 'name'); // TODO
        } else {
          this.renderMode = getSavedConfig('render-mode', 'default');
        }
        this.hideNavLeft = Boolean(getGlobalSavedConfig('hide-nav-left', true));
        this.hideNavRight = Boolean(getGlobalSavedConfig('hide-nav-right', false));

        // update loading state
        this.loadingState = LOADING_STATES.CONTENT;
        this.requestUpdate();
        // return

        // read location content
        try {
          if (this.pathInfo.isDirectory()) {
            await this.readDirectory(drive);
          } else if (getPath().endsWith('.view')) {
            await this.readViewfile(drive);
          }
        } catch (e) {
          console.log(e);
        }

        if (location.hash === '#edit') {
          navigator.executeSidebarCommand('show-panel', 'editor-app');
          navigator.executeSidebarCommand('set-context', 'editor-app', getUrl());
          history.replaceState(undefined, document.title, window.location.origin + '/' + getUrl().split('#')[0]);
        }

        console.log({
          driveInfo: this.driveInfo,
          mountInfo: this.mountInfo,
          pathInfo: this.pathInfo,
          items: this.items,
          itemGroups: this.itemGroups
        });

        this.loadingState = LOADING_STATES.LOADED;
        this.requestUpdate();
      }

      async readPathAncestry () {
        var ancestry = [];
        var drive = new Hyperdrive(getOrigin());
        var pathParts = getPath().split('/').filter(Boolean);
        while (pathParts.length) {
          let name = pathParts[pathParts.length - 1];
          let path = '/' + pathParts.join('/');
          let stat = undefined;
          let mount = undefined;
          if (path === getPath()) {
            stat = this.pathInfo;
          } else {
            stat = await this.attempt(
              `Reading path information (${path})`,
              () => drive.stat(path).catch(e => undefined)
            );
          }
          if (stat.mount) {
            mount = await this.attempt(
              `Reading drive information (${stat.mount.key}) for parent mount at ${path}`,
              () => (new Hyperdrive(stat.mount.key)).getInfo()
            );
          }
          ancestry.unshift({name, path, stat, mount});
          if (!this.mountInfo && mount) {
            // record the mount info for the "closest" mount
            this.mountInfo = mount;
            this.mountInfo.mountPath = pathParts.join('/');
          }
          pathParts.pop();
        }
        this.pathAncestry = ancestry;
      }

      async readDirectory (drive) {
        let driveKind = '';
        if (this.currentDriveInfo.url === navigator.filesystem.url) driveKind = 'root';
        if (this.currentDriveInfo.type === 'unwalled.garden/person') driveKind = 'person';

        var items = await this.attempt(
          `Reading directory (${getPath()})`,
          () => drive.readdir(getPath(), {includeStats: true})
        );

        for (let item of items) {
          item.drive = this.currentDriveInfo;
          item.path = joinPath(getPath(), item.name);
          item.url = joinPath(getOrigin(), item.path);
          item.realPath = this.getRealPathname(item.path);
          item.realUrl = joinPath(item.drive.url, item.realPath);
          if (item.stat.mount) {
            item.mount = await this.attempt(
              `Reading drive information (${item.stat.mount.key}) for mounted drive at ${item.path}`,
              () => (new Hyperdrive(item.stat.mount.key)).getInfo()
            );
          }
          item.shareUrl = this.getShareUrl(item);
          this.setItemIcons(driveKind, item);
        }
        
        this.sortItems(items);
        this.items = items;
      }

      async readViewfile (drive) {
        var viewFile = await drive.readFile(getPath(), 'utf8');
        this.viewfileObj = JSON.parse(viewFile);
        validateViewfile(this.viewfileObj);

        var items = await this.attempt(
          `Running .view query (${getPath()})`,
          () => navigator.filesystem.query(this.viewfileObj.query)
        );

        // massage the items to fit same form as `readDirectory()`
        // TODO- cache the drive getInfo reads
        await this.attempt(
          `Reading .view file information (${getPath()})`,
          () => Promise.all(items.map(async (item) => {
          item.name = item.path.split('/').pop();
          item.realPath = (new URL(item.url)).pathname;
          item.realUrl = item.url;
          item.url = joinPath(getOrigin(), item.path);
          item.shareUrl = this.getShareUrl(item);
          item.drive = await (new Hyperdrive(item.drive)).getInfo();
          item.mount = item.mount ? await (new Hyperdrive(item.mount)).getInfo() : undefined;
          this.setItemIcons('', item);
        })));

        // apply merge
        if (getVFCfg(this.viewfileObj, 'merge', ['mtime', undefined])) {
          let map = {};
          for (let item of items) {
            if (item.name in map) {
              map[item.name] =  (map[item.name].stat.mtime > item.stat.mtime) ? map[item.name] : item;
            } else {
              map[item.name] = item;
            }
          }
          items = Object.values(map);
        }

        this.items = items;
      }

      getShareUrl (item) {
        if (item.stat.mount) {
          return `hd://${item.stat.mount.key}`
        } else if (item.name.endsWith('.goto') && item.stat.metadata.href) {
          return item.stat.metadata.href
        } else {
          return item.realUrl
        }
      }

      setItemIcons (driveKind, item) {
        item.icon = item.stat.isDirectory() ? 'folder' : 'file';
        if (item.stat.isFile() && item.name.endsWith('.view')) {
          item.icon = 'layer-group';
        } else if (item.stat.isFile() && item.name.endsWith('.goto')) {
          item.icon = 'external-link-alt';
        } else {
          item.subicon = getSubicon(driveKind, item);
        }
      }

      sortItems (items) {
        if (this.sortMode === 'name') {
          items.sort((a, b) => a.name.localeCompare(b.name));
        } else if (this.sortMode === 'name-reversed') {
          items.sort((a, b) => b.name.localeCompare(a.name));
        } else if (this.sortMode === 'newest') {
          items.sort((a, b) => b.stat.ctime - a.stat.ctime);
        } else if (this.sortMode === 'oldest') {
          items.sort((a, b) => a.stat.ctime - b.stat.ctime);
        } else if (this.sortMode === 'recently-changed') {
          items.sort((a, b) => b.stat.mtime - a.stat.mtime);
        }
      }

      get renderModes () {
        if (this.pathInfo.isDirectory()) {
          return [['grid', 'th-large', 'Files Grid'], ['list', 'th-list', 'Files List']]
        } else {
          if (getPath().endsWith('.md') || getPath().endsWith('.goto')) {
            return [['default', 'file', 'Rendered'], ['raw', 'code', 'Source']]
          }
          if (getPath().endsWith('.view')) {
            return [['grid', 'th-large', 'Files Grid'], ['list', 'th-list', 'Files List']]
          }
          return [['default', 'file', 'File']]
        }
      }

      get itemGroups () {
        return toSimpleItemGroups(this.items)
      }

      // rendering
      // =

      render () {
        return html`
      <link rel="stylesheet" href="/css/font-awesome.css">
      <div
        class=${classMap({
          layout: true,
          ['render-mode-' + this.renderMode]: true,
          'hide-nav-left': this.hideNavLeft,
          'hide-nav-right': this.hideNavRight,
        })}
        @contextmenu=${this.onContextmenuLayout}
        @goto=${this.onGoto}
        @change-selection=${this.onChangeSelection}
        @show-context-menu=${this.onShowMenu}
        @new-drive=${this.onNewDrive}
        @new-folder=${this.onNewFolder}
        @new-file=${this.onNewFile}
        @new-mount=${this.onNewMount}
        @clone-drive=${this.onCloneDrive}
        @drive-properties=${this.onDriveProperties}
        @import=${this.onImport}
        @export=${this.onExport}
        @rename=${this.onRename}
        @delete=${this.onDelete}
        @toggle-editor=${this.onToggleEditor}
      >
        <div class="nav-toggle right" @click=${e => this.toggleNav('right')}><span class="fas fa-caret-${this.hideNavRight ? 'left' : 'right'}"></span></div>
        ${this.loadingState === LOADING_STATES.INITIAL
          ? this.renderInitialLoading()
          : html`
            <main>
              ${this.renderHeader()}
              ${this.loadingState === LOADING_STATES.CONTENT ? html`
                <div class="loading-notice">Loading...</div>
              ` : ''}
              ${this.renderErrorState()}
              ${this.renderView()}
            </main>
            ${this.renderRightNav()}
          `}
      </div>
    `
      }

      renderInitialLoading () {
        var errorView = this.renderErrorState();
        if (errorView) return errorView
        return html`
      <div class="loading-view">
        <div>
          <span class="spinner"></span> Searching the network...
        </div>
        ${this.errorState && this.errorState.error.name === 'TimeoutError' ? html`
          <div style="margin-top: 10px; margin-left: 27px; font-size: 12px; opacity: 0.75;">
            We're having some trouble ${this.errorState.task.toLowerCase()}.<br>
            It may not be available on the network.
          </div>
        ` : ''}
      </div>
    `
      }

      renderHeader () {
        return html`
      <div class="header">
        <path-ancestry
          drive-title=${this.driveTitle}
          .driveInfo=${this.driveInfo}
          .pathAncestry=${this.pathAncestry}
        ></path-ancestry>
        ${this.pathInfo.isFile() ? html`
          <span class="date">${timeDifference(this.pathInfo.mtime, true, 'ago')}</span>
        ` : ''}
        <span class="spacer"></span>
        <button class="transparent" @click=${this.onClickSettings}>
          <span class="fas fa-cog"></span> Settings
        </button>
        <button class="primary labeled-btn" @click=${this.onClickActions}>
          Actions${this.selection.length ? ` (${this.selection.length} ${pluralize(this.selection.length, 'item')})` : ''}
          <span class="fas fa-fw fa-caret-down"></span>
        </button>
      </div>
    `
      }

      renderView () {
        if (this.items.length === 0 && (this.loadingState === LOADING_STATES.CONTENT || this.errorState)) {
          // if there are no items, the views will say "this folder is empty"
          // that's inaccurate if we're in a loading or error state, so don't do that
          return ''
        }
        const isViewfile = this.pathInfo.isFile() && getPath().endsWith('.view');
        if (isViewfile) {
          return html`
        <explorer-view-query
          user-url=${this.user.url}
          real-url=${this.realUrl}
          real-pathname=${this.realPathname}
          current-drive-title=${this.currentDriveTitle}
          render-mode=${this.renderMode}
          ?inline-mode=${this.inlineMode}
          .currentDriveInfo=${this.currentDriveInfo}
          .pathInfo=${this.pathInfo}
          .items=${this.items}
          .itemGroups=${this.itemGroups}
          .selection=${this.selection}
        ></explorer-view-query>
      `
        }
        if (this.pathInfo.isDirectory()) {
          return html`
        <explorer-view-folder
          user-url=${this.user.url}
          real-url=${this.realUrl}
          real-pathname=${this.realPathname}
          current-drive-title=${this.currentDriveTitle}
          render-mode=${this.renderMode}
          ?inline-mode=${this.inlineMode}
          .currentDriveInfo=${this.currentDriveInfo}
          .items=${this.items}
          .itemGroups=${this.itemGroups}
          .selection=${this.selection}
        ></explorer-view-folder>
      `
        }
        return html`
      <explorer-view-file
        user-url=${this.user.url}
        real-url=${this.realUrl}
        real-pathname=${this.realPathname}
        current-drive-title=${this.currentDriveTitle}
        render-mode=${this.renderMode}
        .currentDriveInfo=${this.currentDriveInfo}
        .pathInfo=${this.pathInfo}
        .selection=${this.selection}
      ></explorer-view-file>
    `
      }

      renderRightNav () {
        if (this.hideNavRight) return ''

        const isViewfile = this.pathInfo.isFile() && getPath().endsWith('.view');
        return html`
      <nav class="right">
        <drive-info
          user-url=${this.user.url}
          real-url=${this.realUrl}
          .driveInfo=${this.currentDriveInfo}
        ></drive-info>
        ${this.selection.length > 0 ? html`
          <selection-info
            user-url=${this.user.url}
            .driveInfo=${this.driveInfo}
            .pathInfo=${this.pathInfo}
            .mountInfo=${this.mountInfo}
            .selection=${this.selection}
            ?no-preview=${this.inlineMode}
          ></selection-info>
        ` : isViewfile ? html`
          <viewfile-info
            .currentDriveInfo=${this.currentDriveInfo}
            .pathInfo=${this.pathInfo}
            .viewfileObj=${this.viewfileObj}
          ></viewfile-info>
        ` : html``}
        <contextual-help
          user-url=${this.user.url}
          real-pathname=${this.realPathname}
          .driveInfo=${this.driveInfo}
          .pathInfo=${this.pathInfo}
          .mountInfo=${this.mountInfo}
          .selection=${this.selection}
        ></contextual-help>
      </nav>
    `
      }

      renderErrorState () {
        if (!this.errorState || this.errorState.error.name === 'TimeoutError') return undefined
        if (this.errorState.error.name === 'NotFoundError') {
          return html`
        <div class="error-view">
          <div class="error-title"><span class="fas fa-fw fa-exclamation-triangle"></span> File or folder not found</div>
          <div class="error-task">Check the location and try again:</div>
          <pre>${getPath()}</pre>
        </div>
      `

        }
        return html`
      <div class="error-view">
        <div class="error-title"><span class="fas fa-fw fa-exclamation-triangle"></span> Something has gone wrong</div>
        <div class="error-task">While ${this.errorState.task.toLowerCase()}</div>
        <details>
          <summary>${this.errorState.error.toString().split(':').slice(1).join(':').trim()}</summary>
          <pre>${this.errorState.error.stack}</pre>
        </details>
      </div>
    `
      }

      // events
      // =

      onContextmenuLayout (e) {
        if (e.target.tagName === 'INPUT') return
        e.preventDefault();
        e.stopPropagation();
        this.onShowMenu({detail: {x: e.clientX, y: e.clientY}});
      }

      onGoto (e) {
        var {item} = e.detail;
        this.goto(item);
      }

      canShare (item) {
        if (item.mount) {
          return true
        } else if (item.drive.url !== navigator.filesystem.url) {
          return true
        }
        return false
      }

      goto (item, newWindow = false, useHdScheme = false) {
        var url;
        if (typeof item === 'string') {
          url = item;
        } else if (item.name.endsWith('.goto') && item.stat.metadata.href) {
          url = item.stat.metadata.href;
        } else {
          url = joinPath(getOrigin(), item.path);
        }
        if (useHdScheme) {
          if (newWindow) window.open(url);
          else window.location = url;
        } else {
          if (newWindow) openUrl(url);
          else setUrl(url);
        }
      }

      onChangeSelection (e) {
        this.selection = e.detail.selection;
        this.requestUpdate();
      }

      onChangeRenderMode (e, renderMode) {
        this.renderMode = renderMode;
        setSavedConfig('render-mode', this.renderMode);
        this.requestUpdate();
      }

      onToggleInlineMode (e) {
        this.inlineMode = !this.inlineMode;
        setSavedConfig('inline-mode', this.inlineMode ? '1' : '');
        this.requestUpdate();
      }

      onChangeSortMode (e) {
        this.sortMode = e.target.value;
        this.sortItems(this.items);
        setSavedConfig('sort-mode', this.sortMode);
        this.requestUpdate();
      }

      onApplyViewSettingsGlobally (e) {
        setGlobalSavedConfig('render-mode', this.renderMode);
        setGlobalSavedConfig('inline-mode', this.inlineMode ? '1' : '');
        setGlobalSavedConfig('sort-mode', this.sortMode);
        create('Default view settings updated');
      }

      toggleNav (side) {
        if (side === 'left') {
          this.hideNavLeft = !this.hideNavLeft;
          setGlobalSavedConfig('hide-nav-left', this.hideNavLeft ? '1' : '');
        } else {
          this.hideNavRight = !this.hideNavRight;
          setGlobalSavedConfig('hide-nav-right', this.hideNavRight ? '1' : '');
        }
        this.requestUpdate();
      }

      onClickActions (e) {
        e.preventDefault();
        e.stopPropagation();
        let rect = e.currentTarget.getClientRects()[0];
        this.onShowMenu({detail: {x: rect.right, y: rect.bottom, right: true}});
      }

      async onClickSettings (e) {
        e.preventDefault();
        e.stopPropagation();
        let el = e.currentTarget;
        let rect = el.getClientRects()[0];
        el.classList.add('active');
        await create$3(this, {x: (rect.left + rect.right) / 2, y: rect.bottom});
        el.classList.remove('active');
      }

      async onNewDrive (e) {
        var drive = await Hyperdrive.create();
        create('Drive created');
        openUrl(drive.url);
      }

      async onNewFile (e) {
        if (!this.currentDriveInfo.writable) return
        var filename = prompt('Enter the name of your new file');
        if (filename) {
          var pathname = joinPath(this.realPathname, filename);
          var drive = new Hyperdrive(this.currentDriveInfo.url);
          if (await drive.stat(pathname).catch(e => false)) {
            create('A file or folder already exists at that name');
            return
          }
          try {
            await drive.writeFile(pathname, '');
          } catch (e) {
            console.error(e);
            create(`Error: ${e.toString()}`, 'error');
            return
          }
          setUrl(joinPath(getUrl(), filename + '#edit'));
        }
      }

      async onNewFolder (e) {
        if (!this.currentDriveInfo.writable) return
        var foldername = prompt('Enter the name of your new folder');
        if (foldername) {
          var pathname = joinPath(this.realPathname, foldername);
          var drive = new Hyperdrive(this.currentDriveInfo.url);
          try {
            await drive.mkdir(pathname);
          } catch (e) {
            console.error(e);
            create(`Error: ${e.toString()}`, 'error');
          }
        }
      }

      async onNewMount (e) {
        if (!this.currentDriveInfo.writable) return
        var drive = new Hyperdrive(this.currentDriveInfo.url);
        var targetUrl = await navigator.selectDriveDialog({title: 'Select a drive'});
        var target = new Hyperdrive(targetUrl);
        var info = await target.getInfo();
        var name = await getAvailableName(this.realPathname, info.title, drive);
        try {
          await drive.mount(joinPath(this.realPathname, name), target.url);
        } catch (e) {
          create(e.toString(), 'error');
          console.error(e);
        }
        this.load();
      }

      async onCloneDrive (e) {
        var drive = await Hyperdrive.clone(this.currentDriveInfo.url);
        create('Drive created');
        setUrl(drive.url);
      }

      async onDriveProperties (e) {
        await navigator.drivePropertiesDialog(this.currentDriveInfo.url);
        this.load();
      }

      async onImport (e) {
        if (!this.currentDriveInfo.writable) return
        create('Importing...');
        try {
          await navigator.importFilesDialog(getUrl());
          create('Import complete', 'success');
        } catch (e) {
          console.log(e);
          create(e.toString(), 'error');
        }
      }

      async onExport (e) {
        var urls = (this.selection.length ? this.selection : this.items).map(item => item.url);
        create('Exporting...');
        try {
          await navigator.exportFilesDialog(urls);
          create('Export complete', 'success');
        } catch (e) {
          console.log(e);
          create(e.toString(), 'error');
        }
      }

      async onRename (e) {
        if (!this.currentDriveInfo.writable) return
        var oldName = this.selection[0] ? this.selection[0].name : this.filename;
        var newName = prompt('Enter the new name for this file or folder', oldName);
        if (newName) {
          var oldPath = this.selection[0] ? joinPath(this.realPathname, oldName) : this.realPathname;
          var newPath = oldPath.split('/').slice(0, -1).concat([newName]).join('/');
          var drive = new Hyperdrive(this.currentDriveInfo.url);
          try {
            await drive.rename(oldPath, newPath);
          } catch (e) {
            console.error(e);
            create(`Rename failed: ${e.toString()}`, 'error');
            return
          }
          if (!this.selection[0]) {
            // redirect to new location
            setPath(getPath().split('/').slice(0, -1).concat([newName]).join('/'));
          }
        }
      }

      async onDelete (e) {
        if (!this.currentDriveInfo.writable) return

        var drive = new Hyperdrive(this.currentDriveInfo.url);
        const del = async (path, stat) => {
          if (stat.mount && stat.mount.key) {
            await drive.unmount(path);
          } else if (stat.isDirectory()) {
            await drive.rmdir(path, {recursive: true});
          } else {
            await drive.unlink(path);
          }
        };

        try {
          if (this.selection.length) {
            if (!confirm(`Delete ${this.selection.length} ${pluralize(this.selection.length, 'item')}?`)) {
              return
            }

            create(`Deleting ${pluralize(this.selection.length, 'item')}...`);
            for (let sel of this.selection) {
              await del(sel.realPath, sel.stat);
            }
            create(`Deleted ${pluralize(this.selection.length, 'item')}`, 'success');
          } else {
            if (!confirm(`Are you sure you want to delete this ${this.pathInfo.isDirectory() ? 'folder' : 'file'}?`)) {
              return
            }

            create(`Deleting 1 item...`);
            await del(this.realPathname, this.pathInfo);
            create(`Deleted 1 item`, 'success');

            setPath(getPath().split('/').slice(0, -1).join('/'));
          }
        } catch (e) {
          console.error(e);
          create(`Deletion failed: ${e.toString()}`, 'error');
        }
      }

      onToggleEditor (e) {
        navigator.executeSidebarCommand('show-panel', 'editor-app');
        navigator.executeSidebarCommand('set-context', 'editor-app', getUrl());
      }

      onShowMenu (e) {
        create$1({
          x: e.detail.x,
          y: e.detail.y,
          right: e.detail.right || (e.detail.x > document.body.scrollWidth - 300),
          top: (e.detail.y > document.body.scrollHeight / 2),
          roomy: false,
          noBorders: true,
          fontAwesomeCSSUrl: '/css/font-awesome.css',
          style: `padding: 4px 0`,
          items: constructItems(this)
        });
      }

      onClickShare (e) {
        e.preventDefault();
        e.stopPropagation();
        var rect = e.currentTarget.getClientRects()[0];
        create$2({
          x: rect.left - 10,
          y: rect.bottom + 4,
          url: this.currentShareUrl,
          targetLabel: (this.selection[0] ? this.selection[0].stat : this.pathInfo).isDirectory() ? 'folder' : 'file'
        });
      }

      async doCompare (base) {
        var target = await navigator.selectFileDialog({
          title: 'Select a folder to compare against',
          select: ['folder']
        });
        window.open(`beaker://compare/?base=${base}&target=${target[0].url}`);
      }
    }

    customElements.define('explorer-app', ExplorerApp);

    exports.ExplorerApp = ExplorerApp;

    return exports;

}({}));
