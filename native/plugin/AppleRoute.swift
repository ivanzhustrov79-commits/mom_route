//  AppleRoute.swift — время в пути от Apple Карт, с настоящими пробками.
//
//  Зачем: OSRM даёт время по свободной дороге, и мы домножали его на
//  придуманную кривую загруженности. MKDirections отдаёт реальную оценку —
//  бесплатно, без ключей и без лимитов на аккаунт. departureDate позволяет
//  спросить не «сколько ехать сейчас», а «сколько ехать в 18:20».
//
//  Установка: перетащить этот файл в цель App в Xcode (Copy items if needed).
//  Capacitor 6+ находит плагин сам по CAPBridgedPlugin, ничего регистрировать
//  вручную не нужно.

import Foundation
import Capacitor
import MapKit

@objc(AppleRoutePlugin)
public class AppleRoutePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "AppleRoutePlugin"
    public let jsName = "AppleRoute"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "eta", returnType: CAPPluginReturnPromise)
    ]

    private func point(_ o: [String: Any]?) -> MKMapItem? {
        guard let o = o,
              let lat = o["lat"] as? Double,
              let lon = o["lon"] as? Double else { return nil }
        let c = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        return MKMapItem(placemark: MKPlacemark(coordinate: c))
    }

    @objc func eta(_ call: CAPPluginCall) {
        guard let from = point(call.getObject("from")),
              let to   = point(call.getObject("to")) else {
            call.reject("нужны точки from и to с полями lat и lon")
            return
        }

        let req = MKDirections.Request()
        req.source = from
        req.destination = to
        req.transportType = .automobile

        // Время выезда: с ним оценка учитывает ожидаемые пробки на тот час,
        // а не только те, что стоят прямо сейчас.
        if let ms = call.getDouble("departAt"), ms > 0 {
            req.departureDate = Date(timeIntervalSince1970: ms / 1000)
        }

        MKDirections(request: req).calculateETA { resp, err in
            if let r = resp {
                call.resolve([
                    "seconds": r.expectedTravelTime,
                    "meters": r.distance
                ])
            } else {
                call.reject(err?.localizedDescription ?? "маршрут не построен")
            }
        }
    }
}
