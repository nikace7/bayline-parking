from django.urls import path

from modules.sites import views

urlpatterns = [
    path("locations", views.LocationListView.as_view()),
    path("locations/<uuid:location_id>/bays", views.BayListView.as_view()),
    path("locations/<uuid:location_id>/tariffs", views.TariffListView.as_view()),
]
