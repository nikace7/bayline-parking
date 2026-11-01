from django.urls import path

from modules.sites import views

urlpatterns = [
    path("locations", views.LocationListView.as_view()),
    path("locations/<uuid:location_id>/bays", views.BayListView.as_view()),
    path("locations/<uuid:location_id>/zones", views.ZoneListView.as_view()),
    path(
        "locations/<uuid:location_id>/zones/<uuid:zone_id>/pools/<uuid:pool_id>",
        views.PoolDetailView.as_view(),
    ),
    path("locations/<uuid:location_id>/bays/<uuid:bay_id>", views.BayDetailView.as_view()),
    path("locations/<uuid:location_id>/tariffs", views.TariffListView.as_view()),
]
