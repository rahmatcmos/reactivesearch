import React, { Component } from 'react';
import { withGoogleMap, GoogleMap, Marker } from 'react-google-maps';
import {
	addComponent,
	removeComponent,
	setStreaming,
	watchComponent,
	setQueryOptions,
	updateQuery,
	loadMore,
	setMapData,
} from '@appbaseio/reactivecore/lib/actions';
import {
	isEqual,
	getQueryOptions,
	pushToAndClause,
	parseHits,
	getInnerKey,
	getClassName,
} from '@appbaseio/reactivecore/lib/utils/helper';
import types from '@appbaseio/reactivecore/lib/utils/types';

import Dropdown from '@appbaseio/reactivesearch/lib/components/shared/Dropdown';
import { connect } from '@appbaseio/reactivesearch/lib/utils';
import Pagination from '@appbaseio/reactivesearch/lib/components/result/addons/Pagination';
import { Checkbox } from '@appbaseio/reactivesearch/lib/styles/FormControlList';

const Standard = require('./addons/styles/Standard');
const BlueEssence = require('./addons/styles/BlueEssence');
const BlueWater = require('./addons/styles/BlueWater');
const FlatMap = require('./addons/styles/FlatMap');
const LightMonochrome = require('./addons/styles/LightMonochrome');
const MidnightCommander = require('./addons/styles/MidnightCommander');
const UnsaturatedBrowns = require('./addons/styles/UnsaturatedBrowns');

const MapComponent = withGoogleMap((props) => {
	const { children, onMapMounted, ...allProps } = props;

	return (
		<GoogleMap
			ref={onMapMounted}
			{...allProps}
		>
			{children}
		</GoogleMap>
	);
});

class ReactiveMap extends Component {
	constructor(props) {
		super(props);

		this.mapStyles = [
			{ label: 'Standard', value: Standard },
			{ label: 'Blue Essence', value: BlueEssence },
			{ label: 'Blue Water', value: BlueWater },
			{ label: 'Flat Map', value: FlatMap },
			{ label: 'Light Monochrome', value: LightMonochrome },
			{ label: 'Midnight Commander', value: MidnightCommander },
			{ label: 'Unsaturated Browns', value: UnsaturatedBrowns },
		];

		const currentMapStyle = this.mapStyles
			.find(style => style.label === props.defaultMapStyle) || this.mapStyles[0];

		this.state = {
			currentMapStyle,
			from: props.currentPage * props.size || 0,
			isLoading: false,
			totalPages: 0,
			currentPage: props.currentPage,
			mapBoxBounds: null,
			searchAsMove: props.searchAsMove,
			zoom: props.defaultZoom,
			useCurrentCenter: false,
		};
		this.mapRef = null;
		this.internalComponent = `${props.componentId}__internal`;
	}

	componentDidMount() {
		this.props.addComponent(this.internalComponent);
		this.props.addComponent(this.props.componentId);
		this.props.setMapData(this.props.componentId, null, !!this.props.center);

		if (this.props.stream) {
			this.props.setStreaming(this.props.componentId, true);
		}

		const options = getQueryOptions(this.props);
		options.from = this.state.from;
		if (this.props.sortBy) {
			options.sort = [{
				[this.props.dataField]: {
					order: this.props.sortBy,
				},
			}];
		}

		this.defaultQuery = null;
		if (this.props.defaultQuery) {
			this.defaultQuery = this.props.defaultQuery();
			// Override sort query with defaultQuery's sort if defined
			if (this.defaultQuery.sort) {
				options.sort = this.defaultQuery.sort;
			}
		}

		this.props.setQueryOptions(
			this.props.componentId,
			options,
			!(this.defaultQuery && this.defaultQuery.query),
		);
		this.setReact(this.props);

		if (this.defaultQuery) {
			const { sort, ...query } = this.defaultQuery;
			this.props.updateQuery({
				componentId: this.internalComponent,
				query,
			});
		} else {
			this.props.updateQuery({
				componentId: this.internalComponent,
				query: null,
			});
		}
	}

	componentWillReceiveProps(nextProps) {
		if (
			this.props.sortBy !== nextProps.sortBy
			|| this.props.size !== nextProps.size
			|| !isEqual(this.props.dataField, nextProps.dataField)
		) {
			const options = getQueryOptions(nextProps);
			options.from = this.state.from;
			if (nextProps.sortBy) {
				options.sort = [{
					[nextProps.dataField]: {
						order: nextProps.sortBy,
					},
				}];
			}
			this.props.setQueryOptions(this.props.componentId, options, true);
		}

		if (!isEqual(this.props.center, nextProps.center)) {
			this.props.setMapData(
				this.props.componentId,
				this.getGeoQuery(),
				!!nextProps.center,
			);
		}

		if (
			nextProps.defaultQuery
			&& !isEqual(nextProps.defaultQuery(), this.defaultQuery)
		) {
			const options = getQueryOptions(nextProps);
			options.from = this.state.from;
			this.defaultQuery = nextProps.defaultQuery();

			const { sort, ...query } = this.defaultQuery;

			if (sort) {
				options.sort = this.defaultQuery.sort;
				nextProps.setQueryOptions(nextProps.componentId, options, !query);
			}

			this.props.updateQuery({
				componentId: this.internalComponent,
				query,
			});
		}

		if (this.props.stream !== nextProps.stream) {
			this.props.setStreaming(nextProps.componentId, nextProps.stream);
		}

		if (!isEqual(nextProps.react, this.props.react)) {
			this.setReact(nextProps);
		}

		// called when page is changed
		if (this.props.pagination && this.state.isLoading) {
			this.setState({
				isLoading: false,
			});
		}

		if (
			!nextProps.pagination
			&& this.props.hits
			&& nextProps.hits
			&& (
				this.props.hits.length < nextProps.hits.length
				|| nextProps.hits.length === nextProps.total
			)
		) {
			this.setState({
				isLoading: false,
			});
		}

		if (
			!nextProps.pagination
			&& nextProps.hits
			&& this.props.hits
			&& nextProps.hits.length < this.props.hits.length
		) {
			this.setState({
				from: 0,
				isLoading: false,
			});
		}

		if (nextProps.pagination && nextProps.total !== this.props.total) {
			this.setState({
				totalPages: Math.ceil(nextProps.total / nextProps.size),
				currentPage: this.props.total ? 0 : this.state.currentPage,
			});
		}

		if (this.props.searchAsMove !== nextProps.searchAsMove) {
			this.setState({
				searchAsMove: nextProps.searchAsMove,
			});
		}

		if (this.props.defaultZoom !== nextProps.defaultZoom) {
			this.setState({
				zoom: nextProps.defaultZoom,
			});
		}

		if (this.props.defaultMapStyle !== nextProps.defaultMapStyle) {
			this.setState({
				currentMapStyle: this.mapStyles.find(style =>
					style.label === nextProps.defaultMapStyle) || this.mapStyles[0],
			});
		}
	}

	shouldComponentUpdate(nextProps, nextState) {
		if (
			this.state.searchAsMove !== nextState.searchAsMove
			|| this.props.showMapStyles !== nextProps.showMapStyles
			|| this.props.autoCenter !== nextProps.autoCenter
			|| this.props.defaultZoom !== nextProps.defaultZoom
			|| !isEqual(this.state.currentMapStyle, nextState.currentMapStyle)
		) {
			return true;
		}

		if (
			isEqual(this.props.hits, nextProps.hits)
			&& isEqual(this.props.streamHits, nextProps.streamHits)
		) {
			return false;
		}
		return true;
	}

	componentWillUnmount() {
		this.props.removeComponent(this.props.componentId);
		this.props.removeComponent(this.internalComponent);
	}

	setReact = (props) => {
		const { react } = props;
		if (react) {
			const newReact = pushToAndClause(react, this.internalComponent);
			props.watchComponent(props.componentId, newReact);
		} else {
			props.watchComponent(props.componentId, { and: this.internalComponent });
		}
	};

	getHitsCenter = (hits) => {
		const data = hits.map(hit => hit[this.props.dataField]);

		if (data.length) {
			const numCoords = data.length;

			let X = 0.0;
			let Y = 0.0;
			let Z = 0.0;

			data.forEach((location) => {
				if (location) {
					let lat = 0.0;
					let lng = 0.0;

					if (Array.isArray(location)) {
						lat = (location[0] * Math.PI) / 180;
						lng = (location[1] * Math.PI) / 180;
					} else {
						lat = (location.lat * Math.PI) / 180;
						lng = ((location.lng !== undefined ? location.lng : location.lon) * Math.PI) / 180;
					}

					const a = Math.cos(lat) * Math.cos(lng);
					const b = Math.cos(lat) * Math.sin(lng);
					const c = Math.sin(lat);

					X += a;
					Y += b;
					Z += c;
				}
			});

			X /= numCoords;
			Y /= numCoords;
			Z /= numCoords;

			const lng = Math.atan2(Y, X);
			const hyp = Math.sqrt((X * X) + (Y * Y));
			const lat = Math.atan2(Z, hyp);

			const newX = (lat * 180) / Math.PI;
			const newY = (lng * 180) / Math.PI;

			return {
				lat: newX,
				lng: newY,
			};
		}
		return false;
	}

	getGeoQuery = () => {
		if (this.mapRef) {
			const mapBounds = this.mapRef.getBounds();
			const north = mapBounds.getNorthEast().lat();
			const south = mapBounds.getSouthWest().lat();
			const east = mapBounds.getNorthEast().lng();
			const west = mapBounds.getSouthWest().lng();
			const boundingBoxCoordinates = {
				top_left: [west, north],
				bottom_right: [east, south],
			};

			this.setState({
				mapBoxBounds: boundingBoxCoordinates,
			});

			return {
				geo_bounding_box: {
					[this.props.dataField]: boundingBoxCoordinates,
				},
			};
		}
		return null;
	};

	setGeoQuery = (executeUpdate = false) => {
		// execute a new query on initial mount
		if (executeUpdate || (!this.props.defaultQuery && !this.state.mapBoxBounds)) {
			this.defaultQuery = this.getGeoQuery();

			this.props.setMapData(
				this.props.componentId,
				this.defaultQuery,
				!!this.props.center,
			);
		}
	}

	loadMore = () => {
		if (
			this.props.hits
			&& !this.props.pagination
			&& this.props.total !== this.props.hits.length
		) {
			const value = this.state.from + this.props.size;
			const options = getQueryOptions(this.props);

			this.setState({
				from: value,
				isLoading: true,
			});
			this.props.loadMore(this.props.componentId, {
				...options,
				from: value,
			}, true);
		} else if (this.state.isLoading) {
			this.setState({
				isLoading: false,
			});
		}
	};

	setPage = (page) => {
		const value = this.props.size * page;
		const options = getQueryOptions(this.props);
		options.from = this.state.from;
		this.setState({
			from: value,
			isLoading: true,
			currentPage: page,
		});
		this.props.loadMore(this.props.componentId, {
			...options,
			from: value,
		}, false);

		if (this.props.URLParams) {
			this.props.setPageURL(
				`${this.props.componentId}-page`,
				page + 1,
				`${this.props.componentId}-page`,
				false,
				true,
			);
		}
	};

	getIcon = (result) => {
		if (this.props.renderMapPin) {
			return this.props.renderMapPin(result);
		}
		return this.props.mapPin;
	};

	getPosition = (result) => {
		if (result) {
			return this.parseLocation(result[this.props.dataField]);
		}
		return null;
	};

	parseLocation(location) {
		if (Array.isArray(location)) {
			return {
				lat: Number(location[0]),
				lng: Number(location[1]),
			};
		}
		return {
			lat: location
				? Number(location.lat)
				: this.props.defaultCenter.lat,
			lng: location
				? Number(location.lon === undefined ? location.lng : location.lon)
				: this.props.defaultCenter.lng,
		};
	}

	setMapStyle = (currentMapStyle) => {
		this.setState({
			currentMapStyle,
		});
	};

	getCenter = (hits) => {
		if (this.state.searchAsMove && this.mapRef && this.state.useCurrentCenter) {
			const currentCenter = this.mapRef.getCenter();
			this.setState({
				useCurrentCenter: false,
			});
			return this.parseLocation({
				lat: currentCenter.lat(),
				lng: currentCenter.lng(),
			});
		}

		if (hits && hits.length) {
			if (this.props.autoCenter) {
				return this.getHitsCenter(hits) || this.parseLocation(this.props.defaultCenter);
			}
			return hits[0] && hits[0][this.props.dataField]
				? this.getPosition(hits[0])
				: this.parseLocation(this.props.defaultCenter);
		}
		return this.parseLocation(this.props.defaultCenter);
	};

	handleOnIdle = () => {
		this.setGeoQuery();
		if (this.props.mapProps.onIdle) this.props.mapProps.onIdle();
	};

	handleOnDragEnd = () => {
		if (this.state.searchAsMove) {
			this.setState({
				useCurrentCenter: true,
			}, () => {
				this.setGeoQuery(true);
			});
		}
		if (this.props.mapProps.onDragEnd) this.props.mapProps.onDragEnd();
	};

	handleZoomChange = () => {
		const zoom = this.mapRef.getZoom();
		if (this.state.searchAsMove) {
			this.setState({
				zoom,
				useCurrentCenter: true,
			}, () => {
				this.setGeoQuery(true);
			});
		} else {
			this.setState({
				zoom,
			});
		}
		if (this.props.mapProps.onZoomChanged) this.props.mapProps.onZoomChanged();
	}

	toggleSearchAsMove = () => {
		this.setState({
			searchAsMove: !this.state.searchAsMove,
		});
	}

	renderSearchAsMove = () => {
		if (this.props.showSearchAsMove) {
			return (
				<div
					style={{
						position: 'absolute',
						bottom: 30,
						left: 10,
						width: 170,
						backgroundColor: '#fff',
						padding: '8px 10px',
						boxShadow: 'rgba(0,0,0,0.3) 0px 1px 4px -1px',
						borderRadius: 2,
					}}
				>
					<Checkbox
						className={getClassName(this.props.innerClass, 'checkbox') || null}
						id="searchasmove"
						onChange={this.toggleSearchAsMove}
						checked={this.state.searchAsMove}
					/>
					<label
						className={getClassName(this.props.innerClass, 'label') || null}
						htmlFor="searchasmove"
					>
						Search as move
					</label>
				</div>
			);
		}

		return null;
	};

	renderMap = () => {
		const results = parseHits(this.props.hits) || [];
		const streamResults = parseHits(this.props.streamHits) || [];
		let filteredResults = results;

		if (streamResults.length) {
			const ids = streamResults.map(item => item._id);
			filteredResults = filteredResults.filter(item => !ids.includes(item._id));
		}

		return (
			<div style={{ position: 'relative' }}>
				<MapComponent
					containerElement={<div style={{ height: '100vh' }} />}
					mapElement={<div style={{ height: '100%' }} />}
					onMapMounted={(ref) => {
						this.mapRef = ref;
					}}
					zoom={this.state.zoom}
					center={this.getCenter(filteredResults)}
					{...this.props.mapProps}
					onIdle={this.handleOnIdle}
					onZoomChanged={this.handleZoomChange}
					onDragEnd={this.handleOnDragEnd}
					options={{
						styles: this.state.currentMapStyle.value,
						...getInnerKey(this.props.mapProps, 'options'),
					}}
				>
					{
						[...streamResults, ...filteredResults].map((item) => {
							if (this.props.onData) return this.props.onData(item);

							const icon = this.getIcon(item);
							const position = this.getPosition(item);
							return (
								<Marker
									key={item._id}
									icon={icon}
									position={position}
									{...this.props.markerProps}
								/>
							);
						})
					}
					{this.props.markers}
					{this.renderSearchAsMove()}
				</MapComponent>
				{
					this.props.showMapStyles
						? (
							<div
								style={{
									position: 'absolute',
									top: 10,
									right: 46,
									width: 120,
								}}
							>
								<Dropdown
									innerClass={this.props.innerClass}
									items={this.mapStyles}
									onChange={this.setMapStyle}
									selectedItem={this.state.currentMapStyle}
									keyField="label"
									returnsObject
									small
								/>
							</div>
						)
						: null
				}
			</div>
		);
	};

	renderPagination = () => (
		<Pagination
			pages={this.props.pages}
			totalPages={this.state.totalPages}
			currentPage={this.state.currentPage}
			setPage={this.setPage}
			innerClass={this.props.innerClass}
		/>
	);

	render() {
		return (
			<div style={this.props.style} className={this.props.className}>
				{
					this.props.onAllData
						? this.props.onAllData(
							this.props.hits,
							this.props.streamHits,
							this.loadMore,
							this.renderMap,
							this.renderPagination,
						)
						: this.renderMap()
				}
			</div>
		);
	}
}

ReactiveMap.propTypes = {
	addComponent: types.funcRequired,
	setMapData: types.funcRequired,
	loadMore: types.funcRequired,
	removeComponent: types.funcRequired,
	setPageURL: types.func,
	setQueryOptions: types.funcRequired,
	setStreaming: types.func,
	updateQuery: types.funcRequired,
	watchComponent: types.funcRequired,
	currentPage: types.number,
	hits: types.hits,
	isLoading: types.bool,
	streamHits: types.hits,
	time: types.number,
	total: types.number,
	url: types.string,
	// component props
	className: types.string,
	componentId: types.stringRequired,
	dataField: types.stringRequired,
	defaultQuery: types.func,
	innerClass: types.style,
	loader: types.title,
	onData: types.func,
	onAllData: types.func,
	pages: types.number,
	pagination: types.bool,
	react: types.react,
	size: types.number,
	sortBy: types.sortBy,
	sortOptions: types.sortOptions,
	stream: types.bool,
	style: types.style,
	URLParams: types.bool,
	mapPin: types.string,
	renderMapPin: types.func,
	defaultCenter: types.location,
	center: types.location,
	showMapStyles: types.bool,
	autoCenter: types.bool,
	defaultZoom: types.number,
	mapProps: types.props,
	markerProps: types.props,
	markers: types.children,
	searchAsMove: types.bool,
	showSearchAsMove: types.bool,
	defaultMapStyle: types.string,
};

ReactiveMap.defaultProps = {
	size: 10,
	style: {},
	className: null,
	showMapStyles: true,
	defaultMapStyle: 'Standard',
	defaultCenter: {
		lat: -34.397,
		lng: 150.644,
	},
	autoCenter: false,
	defaultZoom: 8,
	mapProps: {},
	markerProps: {},
	markers: null,
	searchAsMove: false,
};

const mapStateToProps = (state, props) => ({
	mapKey: state.config.mapKey,
	hits: state.hits[props.componentId] && state.hits[props.componentId].hits,
	streamHits: state.streamHits[props.componentId] || [],
});

const mapDispatchtoProps = dispatch => ({
	addComponent: component => dispatch(addComponent(component)),
	removeComponent: component => dispatch(removeComponent(component)),
	setStreaming: (component, stream) => dispatch(setStreaming(component, stream)),
	watchComponent: (component, react) => dispatch(watchComponent(component, react)),
	setQueryOptions: (component, props, execute) =>
		dispatch(setQueryOptions(component, props, execute)),
	updateQuery: updateQueryObject => dispatch(updateQuery(updateQueryObject)),
	loadMore: (component, options, append) => dispatch(loadMore(component, options, append)),
	setMapData: (component, geoQuery, mustExecute) =>
		dispatch(setMapData(component, geoQuery, mustExecute)),
});

export default connect(mapStateToProps, mapDispatchtoProps)(ReactiveMap);
